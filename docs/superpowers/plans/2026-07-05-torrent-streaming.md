# Torrent Streaming Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a torrent playback mode to mobius that resolves streams via Jackett (search) + TorrServer (stream), plays them in a native `<video>` element, and is toggled from the UI — with silent fallback to the existing vidcore embed when the local services are unavailable.

**Architecture:** The Express API gains a `/api/stream/*` router that orchestrates the whole pipeline server-side: TMDB IMDb-id lookup → Jackett Torznab search ladder → pure-function ranking → TorrServer add + file selection → returns a direct TorrServer stream URL. The browser plays that URL directly (video bytes never transit Express). The web app gets a persisted `settingsStore` toggle and a `TorrentWatch` component with a manual-override Sources drawer.

**Tech Stack:** TypeScript, Node 20 ESM (NodeNext), Express 4, `fast-xml-parser`, `parse-torrent-title`, `vitest` (api tests); React 19, react-query, zustand + persist, react-router 7 (web).

## Global Constraints

- **Scope:** Personal, locally-run only. Never deployed publicly / commercially. Torrent mode being unavailable (no env vars, e.g. on Vercel) must leave all existing behavior untouched.
- **ESM imports:** API is `"type": "module"` with `moduleResolution: NodeNext`. All relative imports MUST end in `.js` (e.g. `import { rank } from "./rank.js"`). Source files are `.ts`.
- **Shared types:** `@mobius/shared` is consumed as source (`main: ./src/index.ts`). New types go in `packages/shared/src/stream.ts` and are re-exported from `packages/shared/src/index.ts`.
- **New env vars are OPTIONAL:** `env.ts`'s `required()` is only for existing vars. Missing Jackett/TorrServer config ⇒ `available: false`, never a thrown startup error.
- **Error style:** Follow the existing `TmdbError` pattern — a typed error class caught in the central middleware in `apps/api/src/app.ts`.
- **Quality target (ranking):** 1080p sweet spot — prefer 1080p x264/WEB-DL; penalize HEVC/AV1 (browser decode risk); reject CAM/TS/etc.
- **Cache:** Reuse the existing `lru-cache` wrapper in `apps/api/src/lib/cache.ts` (`cached(key, ttlMs, fetcher)`).
- **Commits:** One commit per task, conventional-commit style, ending with the Co-Authored-By trailer:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  ```

---

## File Structure

**Created (API):**
- `apps/api/src/stream/env.ts` — optional stream config resolution
- `apps/api/src/stream/types.ts` — internal candidate types (pre-ranking)
- `apps/api/src/stream/errors.ts` — `StreamError` class
- `apps/api/src/stream/jackett.ts` — Torznab client + query ladder + XML parse
- `apps/api/src/stream/rank.ts` — pure filter/score/sort (unit tested)
- `apps/api/src/stream/files.ts` — pure video/episode file selection (unit tested)
- `apps/api/src/stream/torrserver.ts` — TorrServer client + stream URL builder
- `apps/api/src/stream/router.ts` — `/api/stream/{status,sources,play}`
- `apps/api/src/stream/rank.test.ts`, `files.test.ts` — vitest unit tests
- `apps/api/vitest.config.ts`

**Modified (API):**
- `apps/api/src/tmdb/client.ts` — add `externalIds()` method
- `apps/api/src/tmdb/types.ts` — add `TmdbExternalIds` type
- `apps/api/src/app.ts` — mount stream router; handle `StreamError` in middleware
- `apps/api/package.json` — add deps + `test` script
- `apps/api/.env.example` — document new optional vars

**Created (shared):**
- `packages/shared/src/stream.ts` — `StreamStatus`, `StreamSource`, `StreamPlayRequest`, `StreamPlayResponse`

**Modified (shared):**
- `packages/shared/src/index.ts` — re-export `./stream.js`

**Created (web):**
- `apps/web/src/stores/settingsStore.ts` — persisted playback-mode toggle
- `apps/web/src/queries/stream.ts` — react-query hooks for status/play
- `apps/web/src/streaming/components/TorrentWatch.tsx` — native player + Sources drawer
- `apps/web/src/streaming/components/SettingsMenu.tsx` — toggle popover

**Modified (web):**
- `apps/web/src/routes/WatchRoute.tsx` — branch to TorrentWatch when mode=torrent & available
- `apps/web/src/streaming/components/TopNav.tsx` — mount SettingsMenu
- `apps/web/src/streaming/styles/dark-morphism.css` — styles for player/drawer/settings

---

## Task 1: Shared stream types

**Files:**
- Create: `packages/shared/src/stream.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces (consumed by nearly every later task):
  - `type StreamServiceState = "ok" | "unreachable" | "unconfigured"`
  - `type StreamStatus = { available: boolean; jackett: StreamServiceState; torrserver: StreamServiceState }`
  - `type StreamSource = { id: string; title: string; indexer: string; sizeBytes: number; seeders: number; leechers: number; resolution: string; source: string; codec: string; isSeasonPack: boolean; magnet?: string; linkUrl?: string; score: number }`
  - `type StreamPlayRequest = { kind: "movie" | "tv"; id: number; s?: number; e?: number; sourceId?: string }`
  - `type StreamPlayResponse = { streamUrl: string; source: StreamSource; sources: StreamSource[] }`

- [ ] **Step 1: Create the types file**

Create `packages/shared/src/stream.ts`:

```typescript
import type { MediaKind } from "./tmdb.js";

export type StreamServiceState = "ok" | "unreachable" | "unconfigured";

export type StreamStatus = {
  available: boolean;
  jackett: StreamServiceState;
  torrserver: StreamServiceState;
};

export type StreamSource = {
  id: string;
  title: string;
  indexer: string;
  sizeBytes: number;
  seeders: number;
  leechers: number;
  resolution: string; // "1080p", "720p", "2160p", "" if unknown
  source: string; // "WEB-DL", "BluRay", "HDTV", "" if unknown
  codec: string; // "x264", "x265", "" if unknown
  isSeasonPack: boolean;
  magnet?: string;
  linkUrl?: string; // Jackett .torrent proxy link (fallback when no magnet)
  score: number;
};

export type StreamPlayRequest = {
  kind: MediaKind;
  id: number;
  s?: number;
  e?: number;
  sourceId?: string;
};

export type StreamPlayResponse = {
  streamUrl: string;
  source: StreamSource;
  sources: StreamSource[];
};
```

- [ ] **Step 2: Re-export from the package index**

In `packages/shared/src/index.ts`, add after the existing `export * from "./catalog.js";` line:

```typescript
export * from "./stream.js";
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w @mobius/shared`
Expected: PASS (no output errors).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/stream.ts packages/shared/src/index.ts
git commit -m "feat(shared): add stream mode types

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: API dependencies, vitest, and stream env

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/stream/env.ts`
- Create: `apps/api/src/stream/env.test.ts`
- Modify: `apps/api/.env.example`

**Interfaces:**
- Produces:
  - `streamEnv: { jackettUrl: string; jackettApiKey: string | undefined; torrserverUrl: string; torrserverPublicUrl: string }`
  - `isStreamConfigured(): boolean` — true iff `jackettApiKey` is set (Jackett is the gate; TorrServer has a default URL and no key).

- [ ] **Step 1: Add dependencies and test script**

Edit `apps/api/package.json`. Add to `dependencies`:

```json
    "fast-xml-parser": "^4.5.1",
    "parse-torrent-title": "^4.5.1",
```

Add to `devDependencies`:

```json
    "vitest": "^2.1.8",
```

Add to `scripts` (after `"typecheck"`):

```json
    "test": "vitest run",
```

Then install:

Run: `npm install`
Expected: lockfile updates, no errors.

- [ ] **Step 2: Create vitest config**

Create `apps/api/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 3: Write the failing env test**

Create `apps/api/src/stream/env.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("stream env", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.JACKETT_URL;
    delete process.env.JACKETT_API_KEY;
    delete process.env.TORRSERVER_URL;
    delete process.env.TORRSERVER_PUBLIC_URL;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("is unconfigured without an api key", async () => {
    const { resolveStreamEnv, isStreamConfigured } = await import("./env.js");
    const e = resolveStreamEnv();
    expect(e.jackettUrl).toBe("http://127.0.0.1:9117");
    expect(e.torrserverUrl).toBe("http://127.0.0.1:8090");
    expect(e.torrserverPublicUrl).toBe("http://127.0.0.1:8090");
    expect(isStreamConfigured(e)).toBe(false);
  });

  it("is configured with an api key and honors overrides", async () => {
    process.env.JACKETT_API_KEY = "abc";
    process.env.JACKETT_URL = "http://box:9117";
    process.env.TORRSERVER_PUBLIC_URL = "http://192.168.1.5:8090";
    const { resolveStreamEnv, isStreamConfigured } = await import("./env.js");
    const e = resolveStreamEnv();
    expect(e.jackettApiKey).toBe("abc");
    expect(e.jackettUrl).toBe("http://box:9117");
    expect(e.torrserverPublicUrl).toBe("http://192.168.1.5:8090");
    expect(isStreamConfigured(e)).toBe(true);
  });

  it("defaults public url to the internal torrserver url", async () => {
    process.env.TORRSERVER_URL = "http://box:8090";
    const { resolveStreamEnv } = await import("./env.js");
    expect(resolveStreamEnv().torrserverPublicUrl).toBe("http://box:8090");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -w @mobius/api -- src/stream/env.test.ts`
Expected: FAIL — cannot resolve `./env.js`.

- [ ] **Step 5: Implement stream env**

Create `apps/api/src/stream/env.ts`:

```typescript
export type StreamEnv = {
  jackettUrl: string;
  jackettApiKey: string | undefined;
  torrserverUrl: string;
  torrserverPublicUrl: string;
};

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function resolveStreamEnv(): StreamEnv {
  const jackettUrl = trimTrailingSlash(
    process.env.JACKETT_URL || "http://127.0.0.1:9117",
  );
  const torrserverUrl = trimTrailingSlash(
    process.env.TORRSERVER_URL || "http://127.0.0.1:8090",
  );
  const torrserverPublicUrl = trimTrailingSlash(
    process.env.TORRSERVER_PUBLIC_URL || torrserverUrl,
  );
  const jackettApiKey = process.env.JACKETT_API_KEY || undefined;
  return { jackettUrl, jackettApiKey, torrserverUrl, torrserverPublicUrl };
}

export function isStreamConfigured(env: StreamEnv): boolean {
  return typeof env.jackettApiKey === "string" && env.jackettApiKey.length > 0;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -w @mobius/api -- src/stream/env.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Document env vars**

Append to `apps/api/.env.example`:

```
# Torrent streaming mode (optional; local-only). Absence disables torrent mode.
# JACKETT_API_KEY gates the feature — copy it from the Jackett dashboard.
JACKETT_URL=http://127.0.0.1:9117
JACKETT_API_KEY=
TORRSERVER_URL=http://127.0.0.1:8090
# Set to the machine's LAN IP (e.g. http://192.168.1.5:8090) to watch from other devices.
TORRSERVER_PUBLIC_URL=
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json package-lock.json apps/api/vitest.config.ts apps/api/src/stream/env.ts apps/api/src/stream/env.test.ts apps/api/.env.example
git commit -m "chore(api): add stream deps, vitest, and optional stream env

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Ranking (pure functions)

**Files:**
- Create: `apps/api/src/stream/types.ts`
- Create: `apps/api/src/stream/rank.ts`
- Create: `apps/api/src/stream/rank.test.ts`

**Interfaces:**
- Consumes: `StreamSource` from `@mobius/shared`.
- Produces:
  - `type Candidate` (internal, in `types.ts`):
    ```typescript
    type Candidate = {
      id: string; title: string; indexer: string; sizeBytes: number;
      seeders: number; leechers: number; magnet?: string; linkUrl?: string;
    };
    ```
  - `type RankContext = { kind: "movie" | "tv"; year: number | null; season?: number; episode?: number; fromImdb: boolean }`
  - `rankSources(candidates: Candidate[], ctx: RankContext): StreamSource[]` — parses, filters, scores, sorts desc, returns `StreamSource[]`. Enriches each with `resolution/source/codec/isSeasonPack/score`.

- [ ] **Step 1: Create the internal candidate type**

Create `apps/api/src/stream/types.ts`:

```typescript
// Raw Jackett result, before parsing/ranking into a shared StreamSource.
export type Candidate = {
  id: string;
  title: string;
  indexer: string;
  sizeBytes: number;
  seeders: number;
  leechers: number;
  magnet?: string;
  linkUrl?: string;
};

export type RankContext = {
  kind: "movie" | "tv";
  year: number | null;
  season?: number;
  episode?: number;
  fromImdb: boolean; // true if candidates came from an imdbid search (skips year guard)
};
```

- [ ] **Step 2: Write the failing rank test**

Create `apps/api/src/stream/rank.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { rankSources } from "./rank.js";
import type { Candidate, RankContext } from "./types.js";

const GB = 1024 * 1024 * 1024;

function cand(partial: Partial<Candidate> & { title: string }): Candidate {
  return {
    id: partial.title,
    indexer: "test",
    sizeBytes: 4 * GB,
    seeders: 50,
    leechers: 5,
    magnet: "magnet:?xt=urn:btih:" + partial.title,
    ...partial,
  };
}

const movieCtx: RankContext = {
  kind: "movie",
  year: 2021,
  fromImdb: false,
};

describe("rankSources — movies", () => {
  it("rejects zero-seeder releases", () => {
    const out = rankSources(
      [cand({ title: "Dune 2021 1080p WEB-DL x264", seeders: 0 })],
      movieCtx,
    );
    expect(out).toHaveLength(0);
  });

  it("rejects CAM releases", () => {
    const out = rankSources(
      [cand({ title: "Dune 2021 1080p CAM x264" })],
      movieCtx,
    );
    expect(out).toHaveLength(0);
  });

  it("rejects releases outside movie size bounds", () => {
    const tooBig = rankSources(
      [cand({ title: "Dune 2021 2160p BluRay x265", sizeBytes: 60 * GB })],
      movieCtx,
    );
    expect(tooBig).toHaveLength(0);
    const tooSmall = rankSources(
      [cand({ title: "Dune 2021 480p WEB x264", sizeBytes: 0.3 * GB })],
      movieCtx,
    );
    expect(tooSmall).toHaveLength(0);
  });

  it("rejects text-search results whose year is far off", () => {
    const out = rankSources(
      [cand({ title: "Dune 1984 1080p BluRay x264" })],
      movieCtx, // fromImdb: false, year 2021
    );
    expect(out).toHaveLength(0);
  });

  it("keeps a far-off year when the search was by imdb id", () => {
    const out = rankSources(
      [cand({ title: "Dune 1984 1080p BluRay x264" })],
      { ...movieCtx, fromImdb: true },
    );
    expect(out).toHaveLength(1);
  });

  it("prefers 1080p x264 WEB-DL over 2160p x265 at equal seeds", () => {
    const out = rankSources(
      [
        cand({ title: "Dune 2021 2160p WEB-DL x265", sizeBytes: 10 * GB }),
        cand({ title: "Dune 2021 1080p WEB-DL x264", sizeBytes: 4 * GB }),
      ],
      movieCtx,
    );
    expect(out[0].resolution).toBe("1080p");
    expect(out[0].codec).toMatch(/x264|h264/i);
  });

  it("lets a much healthier swarm win over marginally better quality", () => {
    const out = rankSources(
      [
        cand({ title: "Dune 2021 1080p WEB-DL x264", seeders: 2 }),
        cand({ title: "Dune 2021 720p WEB-DL x264", seeders: 5000 }),
      ],
      movieCtx,
    );
    expect(out[0].resolution).toBe("720p");
  });

  it("parses fields onto the StreamSource", () => {
    const out = rankSources(
      [cand({ title: "Dune 2021 1080p WEB-DL x264", seeders: 100 })],
      movieCtx,
    );
    expect(out[0]).toMatchObject({
      resolution: "1080p",
      source: expect.stringMatching(/web/i),
      isSeasonPack: false,
    });
    expect(out[0].score).toBeGreaterThan(0);
  });
});

const tvCtx: RankContext = {
  kind: "tv",
  year: null,
  season: 1,
  episode: 3,
  fromImdb: false,
};

describe("rankSources — tv", () => {
  it("keeps the matching single episode", () => {
    const out = rankSources(
      [cand({ title: "The Show S01E03 1080p WEB-DL x264", sizeBytes: 1.5 * GB })],
      tvCtx,
    );
    expect(out).toHaveLength(1);
    expect(out[0].isSeasonPack).toBe(false);
  });

  it("rejects a different episode", () => {
    const out = rankSources(
      [cand({ title: "The Show S01E05 1080p WEB-DL x264", sizeBytes: 1.5 * GB })],
      tvCtx,
    );
    expect(out).toHaveLength(0);
  });

  it("keeps a season pack for the right season and tags it", () => {
    const out = rankSources(
      [cand({ title: "The Show S01 COMPLETE 1080p WEB-DL x264", sizeBytes: 20 * GB })],
      tvCtx,
    );
    expect(out).toHaveLength(1);
    expect(out[0].isSeasonPack).toBe(true);
  });

  it("prefers the single episode over the season pack", () => {
    const out = rankSources(
      [
        cand({ title: "The Show S01 COMPLETE 1080p WEB-DL x264", sizeBytes: 20 * GB, seeders: 100 }),
        cand({ title: "The Show S01E03 1080p WEB-DL x264", sizeBytes: 1.5 * GB, seeders: 100 }),
      ],
      tvCtx,
    );
    expect(out[0].isSeasonPack).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w @mobius/api -- src/stream/rank.test.ts`
Expected: FAIL — cannot resolve `./rank.js`.

- [ ] **Step 4: Implement ranking**

Create `apps/api/src/stream/rank.ts`:

```typescript
import ptt from "parse-torrent-title";
import type { StreamSource } from "@mobius/shared";
import type { Candidate, RankContext } from "./types.js";

const GB = 1024 * 1024 * 1024;

// Sources we never want to stream.
const BANNED_SOURCE = /\b(cam|camrip|ts|telesync|tc|telecine|hdcam|hdts|screener|scr)\b/i;

type Parsed = {
  resolution?: string;
  source?: string;
  codec?: string;
  season?: number;
  episode?: number;
  year?: number;
  complete?: boolean;
};

function parseTitle(title: string): Parsed {
  return ptt.parse(title) as Parsed;
}

function isSeasonPack(p: Parsed, title: string): boolean {
  // A pack has a season but no single episode, or is flagged complete.
  if (p.episode != null) return false;
  if (p.complete) return true;
  if (p.season != null) return true;
  return /\bcomplete\b|\bseason\b/i.test(title);
}

function resolutionScore(res: string): number {
  switch (res) {
    case "1080p":
      return 100;
    case "720p":
      return 70;
    case "2160p":
      return 55;
    case "480p":
      return 30;
    default:
      return 30;
  }
}

function seedScore(seeders: number): number {
  return Math.min(40, 10 * Math.log10(seeders + 1) * 2);
}

function sourceScore(source: string): number {
  const s = source.toLowerCase();
  if (s.includes("web-dl") || s.includes("webdl") || s.includes("bluray") || s.includes("web-dl")) return 25;
  if (s.includes("webrip") || s.includes("web")) return 15;
  if (s.includes("hdtv")) return 5;
  return 0;
}

function codecScore(codec: string): number {
  const c = codec.toLowerCase();
  if (c.includes("264") || c.includes("avc")) return 15;
  if (c.includes("265") || c.includes("hevc") || c.includes("av1")) return -10;
  return 0;
}

function sizeScore(sizeBytes: number, kind: "movie" | "tv", pack: boolean): number {
  const gb = sizeBytes / GB;
  if (kind === "movie") {
    if (gb >= 2 && gb <= 6) return 10;
    return Math.max(-15, 10 - Math.abs(gb - 4) * 3);
  }
  if (pack) return 0;
  if (gb >= 0.5 && gb <= 2.5) return 10;
  return Math.max(-15, 10 - Math.abs(gb - 1.5) * 6);
}

function passesFilters(
  c: Candidate,
  p: Parsed,
  pack: boolean,
  ctx: RankContext,
): boolean {
  if (c.seeders < 1) return false;
  if (BANNED_SOURCE.test(c.title)) return false;

  const gb = c.sizeBytes / GB;
  if (ctx.kind === "movie") {
    if (gb < 0.7 || gb > 12) return false;
    if (!ctx.fromImdb && ctx.year != null && p.year != null) {
      if (Math.abs(p.year - ctx.year) > 1) return false;
    }
  } else {
    // TV
    if (pack) {
      if (gb > 80) return false;
      if (ctx.season != null && p.season != null && p.season !== ctx.season) {
        return false;
      }
    } else {
      if (gb < 0.1 || gb > 4) return false;
      if (ctx.season != null && p.season !== ctx.season) return false;
      if (ctx.episode != null && p.episode !== ctx.episode) return false;
    }
  }
  return true;
}

export function rankSources(
  candidates: Candidate[],
  ctx: RankContext,
): StreamSource[] {
  const scored: StreamSource[] = [];
  for (const c of candidates) {
    const p = parseTitle(c.title);
    const pack = ctx.kind === "tv" && isSeasonPack(p, c.title);
    if (!passesFilters(c, p, pack, ctx)) continue;

    const resolution = p.resolution ?? "";
    const source = p.source ?? "";
    const codec = p.codec ?? "";

    const score =
      resolutionScore(resolution) +
      seedScore(c.seeders) +
      sourceScore(source) +
      codecScore(codec) +
      sizeScore(c.sizeBytes, ctx.kind, pack) +
      (pack ? -5 : 0);

    scored.push({
      id: c.id,
      title: c.title,
      indexer: c.indexer,
      sizeBytes: c.sizeBytes,
      seeders: c.seeders,
      leechers: c.leechers,
      resolution,
      source,
      codec,
      isSeasonPack: pack,
      magnet: c.magnet,
      linkUrl: c.linkUrl,
      score: Math.round(score * 10) / 10,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @mobius/api -- src/stream/rank.test.ts`
Expected: PASS (all cases). If `parse-torrent-title` names a field differently (e.g. `resolution` vs `quality`), adjust the `Parsed` mapping in `parseTitle` accordingly, keeping the test assertions as the contract.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/stream/types.ts apps/api/src/stream/rank.ts apps/api/src/stream/rank.test.ts
git commit -m "feat(api): rank torrent sources by quality/seeds (pure fns)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: File selection (pure functions)

**Files:**
- Create: `apps/api/src/stream/files.ts`
- Create: `apps/api/src/stream/files.test.ts`

**Interfaces:**
- Produces:
  - `type TorrentFile = { index: number; path: string; length: number }`
  - `pickVideoFile(files: TorrentFile[], want?: { season: number; episode: number }): TorrentFile | null` — for movies (no `want`) returns the largest video file; for TV returns the file whose parsed path matches S/E, falling back to the largest video file.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/stream/files.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { pickVideoFile, type TorrentFile } from "./files.js";

const MB = 1024 * 1024;

describe("pickVideoFile — movie", () => {
  it("picks the largest video file, ignoring samples and non-video", () => {
    const files: TorrentFile[] = [
      { index: 0, path: "Dune.2021.1080p/Dune.mkv", length: 4000 * MB },
      { index: 1, path: "Dune.2021.1080p/sample.mkv", length: 40 * MB },
      { index: 2, path: "Dune.2021.1080p/readme.txt", length: 1 * MB },
    ];
    expect(pickVideoFile(files)?.index).toBe(0);
  });

  it("returns null when there is no video file", () => {
    const files: TorrentFile[] = [
      { index: 0, path: "readme.txt", length: 1 * MB },
    ];
    expect(pickVideoFile(files)).toBeNull();
  });
});

describe("pickVideoFile — tv season pack", () => {
  const pack: TorrentFile[] = [
    { index: 0, path: "The.Show.S01/The.Show.S01E01.1080p.mkv", length: 1500 * MB },
    { index: 1, path: "The.Show.S01/The.Show.S01E02.1080p.mkv", length: 1500 * MB },
    { index: 2, path: "The.Show.S01/The.Show.S01E03.1080p.mkv", length: 1500 * MB },
  ];

  it("selects the requested episode from a pack", () => {
    expect(pickVideoFile(pack, { season: 1, episode: 3 })?.index).toBe(2);
  });

  it("falls back to the largest video file when no episode matches", () => {
    const out = pickVideoFile(pack, { season: 2, episode: 9 });
    expect(out).not.toBeNull();
    expect([0, 1, 2]).toContain(out?.index);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @mobius/api -- src/stream/files.test.ts`
Expected: FAIL — cannot resolve `./files.js`.

- [ ] **Step 3: Implement file selection**

Create `apps/api/src/stream/files.ts`:

```typescript
import ptt from "parse-torrent-title";

export type TorrentFile = {
  index: number;
  path: string;
  length: number;
};

const VIDEO_EXT = /\.(mp4|mkv|avi|m4v|webm|mov|ts)$/i;
const SAMPLE = /\bsample\b/i;

function isVideo(f: TorrentFile): boolean {
  return VIDEO_EXT.test(f.path) && !SAMPLE.test(f.path);
}

function largest(files: TorrentFile[]): TorrentFile | null {
  let best: TorrentFile | null = null;
  for (const f of files) {
    if (!isVideo(f)) continue;
    if (!best || f.length > best.length) best = f;
  }
  return best;
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

export function pickVideoFile(
  files: TorrentFile[],
  want?: { season: number; episode: number },
): TorrentFile | null {
  if (!want) return largest(files);

  for (const f of files) {
    if (!isVideo(f)) continue;
    const parsed = ptt.parse(baseName(f.path)) as {
      season?: number;
      episode?: number;
    };
    if (parsed.season === want.season && parsed.episode === want.episode) {
      return f;
    }
  }
  return largest(files);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @mobius/api -- src/stream/files.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/stream/files.ts apps/api/src/stream/files.test.ts
git commit -m "feat(api): select video/episode file from torrent (pure fns)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: TMDB external-ids lookup

**Files:**
- Modify: `apps/api/src/tmdb/types.ts`
- Modify: `apps/api/src/tmdb/client.ts`

**Interfaces:**
- Produces: `tmdb.externalIds({ kind, id }): Promise<TmdbExternalIds>` where `TmdbExternalIds = { imdb_id: string | null }` (TMDB returns more, we only need this). Cached at `TTL.detail`.

- [ ] **Step 1: Add the type**

Append to `apps/api/src/tmdb/types.ts`:

```typescript
export type TmdbExternalIds = {
  imdb_id: string | null;
};
```

- [ ] **Step 2: Add the client method**

In `apps/api/src/tmdb/client.ts`, add `TmdbExternalIds` to the type import block, then add this method to the `tmdb` object (after `images`):

```typescript
  externalIds: ({ kind, id }: { kind: "movie" | "tv"; id: number }) =>
    cached(`external-ids:${kind}:${id}`, TTL.detail, () =>
      tmdbFetch<TmdbExternalIds>(`/${kind}/${id}/external_ids`),
    ),
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w @mobius/api`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/tmdb/types.ts apps/api/src/tmdb/client.ts
git commit -m "feat(api): add TMDB external_ids (imdb id) lookup

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Stream error type

**Files:**
- Create: `apps/api/src/stream/errors.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `class StreamError extends Error { status: number; code: string; constructor(status: number, code: string, message?: string) }`. `code` is one of `stream_unconfigured | no_sources | search_failed | torrent_timeout | invalid_request`.

- [ ] **Step 1: Create the error class**

Create `apps/api/src/stream/errors.ts`:

```typescript
export type StreamErrorCode =
  | "stream_unconfigured"
  | "no_sources"
  | "search_failed"
  | "torrent_timeout"
  | "invalid_request";

export class StreamError extends Error {
  status: number;
  code: StreamErrorCode;

  constructor(status: number, code: StreamErrorCode, message?: string) {
    super(message ?? code);
    this.name = "StreamError";
    this.status = status;
    this.code = code;
  }
}
```

- [ ] **Step 2: Handle it in the error middleware**

In `apps/api/src/app.ts`, add the import near the other imports:

```typescript
import { StreamError } from "./stream/errors.js";
```

Then in the error middleware, add this block BEFORE the `if (err instanceof TmdbError)` block:

```typescript
    if (err instanceof StreamError) {
      logger.warn({ err }, "stream error");
      res.status(err.status).json({ error: err.code, message: err.message });
      return;
    }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w @mobius/api`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/stream/errors.ts apps/api/src/app.ts
git commit -m "feat(api): add StreamError and central handling

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: Jackett Torznab client

**Files:**
- Create: `apps/api/src/stream/jackett.ts`

**Interfaces:**
- Consumes: `resolveStreamEnv`, `StreamEnv` (Task 2); `Candidate` (Task 3); `StreamError` (Task 6).
- Produces:
  - `pingJackett(env: StreamEnv): Promise<boolean>` — GET `/api/v2.0/indexers?configured=true&apikey=…`, true on HTTP 200.
  - `searchJackett(env, params): Promise<Candidate[]>` where
    `params = { kind: "movie"|"tv"; title: string; year: number | null; imdbId: string | null; season?: number; episode?: number }`.
    Runs the query ladder, parses XML, returns de-duplicated `Candidate[]` (raw — ranking happens in Task 3). Throws `StreamError(502, "search_failed")` on network/parse failure.

- [ ] **Step 1: Implement the client**

Create `apps/api/src/stream/jackett.ts`:

```typescript
import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import { logger } from "../lib/logger.js";
import { StreamError } from "./errors.js";
import type { StreamEnv } from "./env.js";
import type { Candidate } from "./types.js";

const TIMEOUT_MS = 25_000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

export async function pingJackett(env: StreamEnv): Promise<boolean> {
  if (!env.jackettApiKey) return false;
  const url = `${env.jackettUrl}/api/v2.0/indexers?configured=true&apikey=${env.jackettApiKey}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

type SearchParams = {
  kind: "movie" | "tv";
  title: string;
  year: number | null;
  imdbId: string | null;
  season?: number;
  episode?: number;
};

type TorznabQuery = Record<string, string>;

// Ordered query ladder. Movies: stop at first tier with results.
// TV: run all tiers and merge (episode results + season pack).
function buildQueries(p: SearchParams): { fromImdb: boolean; q: TorznabQuery }[] {
  const out: { fromImdb: boolean; q: TorznabQuery }[] = [];
  const imdb = p.imdbId ? p.imdbId.replace(/^tt/, "") : null;

  if (p.kind === "movie") {
    if (imdb) out.push({ fromImdb: true, q: { t: "movie", imdbid: `tt${imdb}` } });
    const text = p.year ? `${p.title} ${p.year}` : p.title;
    out.push({ fromImdb: false, q: { t: "search", q: text } });
  } else {
    const s = p.season ?? 1;
    const e = p.episode ?? 1;
    const ss = String(s).padStart(2, "0");
    const ee = String(e).padStart(2, "0");
    if (imdb) {
      out.push({
        fromImdb: true,
        q: { t: "tvsearch", imdbid: `tt${imdb}`, season: String(s), ep: String(e) },
      });
    }
    out.push({ fromImdb: false, q: { t: "search", q: `${p.title} S${ss}E${ee}` } });
    // Season pack tiers.
    if (imdb) {
      out.push({ fromImdb: true, q: { t: "tvsearch", imdbid: `tt${imdb}`, season: String(s) } });
    }
    out.push({ fromImdb: false, q: { t: "search", q: `${p.title} S${ss}` } });
  }
  return out;
}

function hashId(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 16);
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

type TorznabItem = {
  title?: string;
  guid?: string;
  link?: string;
  size?: string | number;
  jackettindexer?: string | { "#text"?: string };
  "torznab:attr"?: unknown;
  enclosure?: { "@_url"?: string; "@_type"?: string } | { "@_url"?: string }[];
};

function attrMap(item: TorznabItem): Record<string, string> {
  const attrs = toArray(item["torznab:attr"] as Record<string, string>[] | Record<string, string>);
  const map: Record<string, string> = {};
  for (const a of attrs) {
    const name = (a as Record<string, string>)["@_name"];
    const value = (a as Record<string, string>)["@_value"];
    if (name != null) map[name] = value;
  }
  return map;
}

function magnetFrom(item: TorznabItem, attrs: Record<string, string>): string | undefined {
  if (attrs.magneturl && attrs.magneturl.startsWith("magnet:")) return attrs.magneturl;
  const enclosures = toArray(item.enclosure);
  for (const enc of enclosures) {
    const url = (enc as { "@_url"?: string })["@_url"];
    if (url && url.startsWith("magnet:")) return url;
  }
  if (typeof item.link === "string" && item.link.startsWith("magnet:")) return item.link;
  return undefined;
}

function linkFrom(item: TorznabItem): string | undefined {
  if (typeof item.link === "string" && !item.link.startsWith("magnet:")) return item.link;
  const enclosures = toArray(item.enclosure);
  for (const enc of enclosures) {
    const url = (enc as { "@_url"?: string })["@_url"];
    if (url && !url.startsWith("magnet:")) return url;
  }
  return undefined;
}

function parseItems(xml: string): Candidate[] {
  const doc = parser.parse(xml) as {
    rss?: { channel?: { item?: TorznabItem | TorznabItem[] } };
  };
  const items = toArray(doc.rss?.channel?.item);
  const candidates: Candidate[] = [];
  for (const item of items) {
    const title = typeof item.title === "string" ? item.title : "";
    if (!title) continue;
    const attrs = attrMap(item);
    const seeders = Number(attrs.seeders ?? "0") || 0;
    const peers = Number(attrs.peers ?? "0") || 0;
    const leechers = Math.max(0, peers - seeders);
    const sizeBytes = Number(item.size ?? attrs.size ?? "0") || 0;
    const indexerRaw = item.jackettindexer;
    const indexer =
      typeof indexerRaw === "string"
        ? indexerRaw
        : (indexerRaw?.["#text"] ?? "unknown");
    const magnet = magnetFrom(item, attrs);
    const linkUrl = linkFrom(item);
    const idSeed = magnet ?? linkUrl ?? title;
    candidates.push({
      id: hashId(idSeed),
      title,
      indexer,
      sizeBytes,
      seeders,
      leechers,
      magnet,
      linkUrl,
    });
  }
  return candidates;
}

async function runQuery(
  env: StreamEnv,
  q: TorznabQuery,
): Promise<Candidate[]> {
  const url = new URL(`${env.jackettUrl}/api/v2.0/indexers/all/results/torznab/api`);
  url.searchParams.set("apikey", env.jackettApiKey ?? "");
  for (const [k, v] of Object.entries(q)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`jackett ${res.status}`);
  const xml = await res.text();
  return parseItems(xml);
}

export async function searchJackett(
  env: StreamEnv,
  params: SearchParams,
): Promise<{ candidates: Candidate[]; fromImdb: boolean }> {
  const ladder = buildQueries(params);
  const merged = new Map<string, Candidate>();
  let anyImdb = false;

  try {
    for (const tier of ladder) {
      const results = await runQuery(env, tier.q);
      if (results.length > 0 && tier.fromImdb) anyImdb = true;
      for (const c of results) {
        if (!merged.has(c.id)) merged.set(c.id, c);
      }
      // Movies: stop at the first tier that returns anything.
      if (params.kind === "movie" && merged.size > 0) break;
    }
  } catch (err) {
    logger.warn({ err }, "jackett search failed");
    throw new StreamError(502, "search_failed", "Jackett search failed");
  }

  return { candidates: [...merged.values()], fromImdb: anyImdb };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w @mobius/api`
Expected: PASS. (No unit test here — Torznab XML shape varies by indexer; this is covered by the manual integration pass in Task 12. The pure logic it feeds, `rankSources`, is already tested.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/stream/jackett.ts
git commit -m "feat(api): Jackett Torznab client with query ladder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: TorrServer client

**Files:**
- Create: `apps/api/src/stream/torrserver.ts`

**Interfaces:**
- Consumes: `StreamEnv` (Task 2); `TorrentFile` (Task 4); `StreamError` (Task 6).
- Produces:
  - `pingTorrServer(env): Promise<boolean>` — GET `/echo`, true on 200.
  - `addAndResolve(env, opts): Promise<{ hash: string; files: TorrentFile[] }>` where
    `opts = { magnet?: string; linkUrl?: string; title: string }`. Adds the torrent (magnet via JSON, else downloads the `.torrent` from `linkUrl` and uploads it), polls until `file_stats` is populated (30s timeout → `StreamError(504,"torrent_timeout")`), returns hash + files.
  - `buildStreamUrl(env, opts): string` where `opts = { hash: string; fileName: string; index: number }` → `${torrserverPublicUrl}/stream/{encoded name}?link={hash}&index={index}&play`.

- [ ] **Step 1: Implement the client**

Create `apps/api/src/stream/torrserver.ts`:

```typescript
import { logger } from "../lib/logger.js";
import { StreamError } from "./errors.js";
import type { StreamEnv } from "./env.js";
import type { TorrentFile } from "./files.js";

const META_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1000;

export async function pingTorrServer(env: StreamEnv): Promise<boolean> {
  try {
    const res = await fetch(`${env.torrserverUrl}/echo`, {
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type RawFileStat = { id?: number; path?: string; length?: number };

type TorrentState = {
  hash?: string;
  file_stats?: RawFileStat[] | null;
};

async function torrentsApi(
  env: StreamEnv,
  body: Record<string, unknown>,
): Promise<TorrentState> {
  const res = await fetch(`${env.torrserverUrl}/torrents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new StreamError(502, "search_failed", `torrserver ${res.status}`);
  return (await res.json()) as TorrentState;
}

async function addMagnet(env: StreamEnv, magnet: string, title: string): Promise<string> {
  const state = await torrentsApi(env, {
    action: "add",
    link: magnet,
    title,
    save_to_db: true,
  });
  if (!state.hash) throw new StreamError(502, "search_failed", "no hash from add");
  return state.hash;
}

async function uploadTorrentFile(
  env: StreamEnv,
  linkUrl: string,
  title: string,
): Promise<string> {
  const dl = await fetch(linkUrl, { signal: AbortSignal.timeout(20_000) });
  if (!dl.ok) throw new StreamError(502, "search_failed", "torrent download failed");
  const buf = new Uint8Array(await dl.arrayBuffer());
  const form = new FormData();
  form.set("save", "true");
  form.set("title", title);
  form.set(
    "file",
    new Blob([buf], { type: "application/x-bittorrent" }),
    "file.torrent",
  );
  const res = await fetch(`${env.torrserverUrl}/torrent/upload`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new StreamError(502, "search_failed", `upload ${res.status}`);
  const state = (await res.json()) as TorrentState;
  if (!state.hash) throw new StreamError(502, "search_failed", "no hash from upload");
  return state.hash;
}

function toFiles(stats: RawFileStat[]): TorrentFile[] {
  return stats
    .filter((s) => typeof s.path === "string" && typeof s.length === "number")
    .map((s) => ({
      index: s.id ?? 0,
      path: s.path as string,
      length: s.length as number,
    }));
}

export async function addAndResolve(
  env: StreamEnv,
  opts: { magnet?: string; linkUrl?: string; title: string },
): Promise<{ hash: string; files: TorrentFile[] }> {
  const hash = opts.magnet
    ? await addMagnet(env, opts.magnet, opts.title)
    : opts.linkUrl
      ? await uploadTorrentFile(env, opts.linkUrl, opts.title)
      : (() => {
          throw new StreamError(502, "search_failed", "source has no magnet or link");
        })();

  const resolvedHash = await hash;
  const deadline = Date.now() + META_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await torrentsApi(env, { action: "get", hash: resolvedHash });
    const stats = state.file_stats;
    if (stats && stats.length > 0) {
      return { hash: resolvedHash, files: toFiles(stats) };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  logger.warn({ hash: resolvedHash }, "torrserver metadata timeout");
  throw new StreamError(504, "torrent_timeout", "Timed out fetching torrent metadata");
}

export function buildStreamUrl(
  env: StreamEnv,
  opts: { hash: string; fileName: string; index: number },
): string {
  const name = encodeURIComponent(opts.fileName);
  return `${env.torrserverPublicUrl}/stream/${name}?link=${opts.hash}&index=${opts.index}&play`;
}
```

Note: `Date.now()` is fine in application code — the ban on it applies only to Workflow scripts, not to the API.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck -w @mobius/api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/stream/torrserver.ts
git commit -m "feat(api): TorrServer client (add, resolve, stream url)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: Stream router

**Files:**
- Create: `apps/api/src/stream/router.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–8 plus `tmdb` client, `cached`/`TTL`, shared types.
- Produces: `streamRouter` (Express Router) mounted at `/api/stream` exposing:
  - `GET /status` → `StreamStatus`
  - `GET /sources?kind&id&s?&e?` → `{ sources: StreamSource[] }`
  - `POST /play` (body `StreamPlayRequest`) → `StreamPlayResponse`

- [ ] **Step 1: Implement the router**

Create `apps/api/src/stream/router.ts`:

```typescript
import { Router, type NextFunction, type Request, type Response } from "express";
import type {
  StreamPlayRequest,
  StreamPlayResponse,
  StreamSource,
  StreamStatus,
} from "@mobius/shared";
import { cached } from "../lib/cache.js";
import { tmdb } from "../tmdb/client.js";
import { resolveStreamEnv, isStreamConfigured } from "./env.js";
import { StreamError } from "./errors.js";
import { pingJackett, searchJackett } from "./jackett.js";
import { pingTorrServer, addAndResolve, buildStreamUrl } from "./torrserver.js";
import { rankSources } from "./rank.js";
import { pickVideoFile } from "./files.js";
import type { RankContext } from "./types.js";

export const streamRouter = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

const SOURCES_TTL = 10 * 60 * 1000;
const STATUS_TTL = 30 * 1000;

function parseKind(v: unknown): "movie" | "tv" {
  if (v === "movie" || v === "tv") return v;
  throw new StreamError(400, "invalid_request", "bad kind");
}

function parseId(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    throw new StreamError(400, "invalid_request", "bad id");
  }
  return Math.floor(n);
}

function optionalInt(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

// Resolve + rank sources, cached 10 min per (kind,id,s,e).
async function resolveSources(
  kind: "movie" | "tv",
  id: number,
  s: number | undefined,
  e: number | undefined,
): Promise<StreamSource[]> {
  const key = `stream:sources:${kind}:${id}:${s ?? ""}:${e ?? ""}`;
  return cached(key, SOURCES_TTL, async () => {
    const env = resolveStreamEnv();
    const detail =
      kind === "movie"
        ? await tmdb.movieDetail(id)
        : await tmdb.tvDetail(id);
    const title =
      (detail as { title?: string; name?: string }).title ??
      (detail as { name?: string }).name ??
      "";
    const dateStr =
      (detail as { release_date?: string; first_air_date?: string })
        .release_date ??
      (detail as { first_air_date?: string }).first_air_date ??
      "";
    const year =
      dateStr.length >= 4 && Number.isFinite(Number(dateStr.slice(0, 4)))
        ? Number(dateStr.slice(0, 4))
        : null;

    let imdbId: string | null = null;
    try {
      imdbId = (await tmdb.externalIds({ kind, id })).imdb_id;
    } catch {
      imdbId = null;
    }

    const { candidates, fromImdb } = await searchJackett(env, {
      kind,
      title,
      year,
      imdbId,
      season: s,
      episode: e,
    });

    const ctx: RankContext = {
      kind,
      year,
      season: s,
      episode: e,
      fromImdb,
    };
    return rankSources(candidates, ctx).slice(0, 20);
  });
}

streamRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const status = await cached<StreamStatus & object>(
      "stream:status",
      STATUS_TTL,
      async () => {
        const env = resolveStreamEnv();
        if (!isStreamConfigured(env)) {
          return {
            available: false,
            jackett: "unconfigured",
            torrserver: "unconfigured",
          } satisfies StreamStatus;
        }
        const [jackettOk, torrOk] = await Promise.all([
          pingJackett(env),
          pingTorrServer(env),
        ]);
        return {
          available: jackettOk && torrOk,
          jackett: jackettOk ? "ok" : "unreachable",
          torrserver: torrOk ? "ok" : "unreachable",
        } satisfies StreamStatus;
      },
    );
    res.json(status);
  }),
);

streamRouter.get(
  "/sources",
  asyncHandler(async (req, res) => {
    const env = resolveStreamEnv();
    if (!isStreamConfigured(env)) {
      throw new StreamError(503, "stream_unconfigured", "torrent mode off");
    }
    const kind = parseKind(req.query.kind);
    const id = parseId(req.query.id);
    const s = optionalInt(req.query.s);
    const e = optionalInt(req.query.e);
    const sources = await resolveSources(kind, id, s, e);
    if (sources.length === 0) throw new StreamError(404, "no_sources");
    res.json({ sources });
  }),
);

streamRouter.post(
  "/play",
  asyncHandler(async (req, res) => {
    const env = resolveStreamEnv();
    if (!isStreamConfigured(env)) {
      throw new StreamError(503, "stream_unconfigured", "torrent mode off");
    }
    const body = req.body as StreamPlayRequest;
    const kind = parseKind(body.kind);
    const id = parseId(body.id);
    const s = optionalInt(body.s);
    const e = optionalInt(body.e);

    const sources = await resolveSources(kind, id, s, e);
    if (sources.length === 0) throw new StreamError(404, "no_sources");

    const chosen =
      (body.sourceId && sources.find((x) => x.id === body.sourceId)) ||
      sources[0];

    const { hash, files } = await addAndResolve(env, {
      magnet: chosen.magnet,
      linkUrl: chosen.linkUrl,
      title: chosen.title,
    });

    const want =
      kind === "tv" && s != null && e != null
        ? { season: s, episode: e }
        : undefined;
    const file = pickVideoFile(files, want);
    if (!file) throw new StreamError(404, "no_sources", "no playable file");

    const fileName = file.path.split(/[\\/]/).pop() ?? file.path;
    const streamUrl = buildStreamUrl(env, {
      hash,
      fileName,
      index: file.index,
    });

    const response: StreamPlayResponse = { streamUrl, source: chosen, sources };
    res.json(response);
  }),
);
```

- [ ] **Step 2: Mount the router**

In `apps/api/src/app.ts`, add the import:

```typescript
import { streamRouter } from "./stream/router.js";
```

And mount it alongside the others (after `app.use("/api/catalog", catalogRouter);`):

```typescript
  app.use("/api/stream", streamRouter);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w @mobius/api`
Expected: PASS.

- [ ] **Step 4: Verify status endpoint runs (unconfigured path)**

Run: `npm run build -w @mobius/shared && (cd apps/api && TMDB_READ_ACCESS_TOKEN=x node --import tsx --eval "import('./src/app.js').then(async m => { const app = m.createApp(); const srv = app.listen(0, async () => { const p = srv.address().port; const r = await fetch('http://127.0.0.1:'+p+'/api/stream/status'); console.log(r.status, await r.text()); srv.close(); }); })")`
Expected: `200 {"available":false,"jackett":"unconfigured","torrserver":"unconfigured"}`
(If `tsx` invocation differs in this environment, instead run `npm run dev -w @mobius/api` in one shell and `curl localhost:3001/api/stream/status` in another; expect the same JSON.)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/stream/router.ts apps/api/src/app.ts
git commit -m "feat(api): stream router (status, sources, play)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 10: Web settings store + stream queries

**Files:**
- Create: `apps/web/src/stores/settingsStore.ts`
- Create: `apps/web/src/queries/stream.ts`

**Interfaces:**
- Produces:
  - `useSettingsStore` — zustand store `{ playbackMode: "vidcore" | "torrent"; setPlaybackMode(m): void }`, persisted to localStorage under `mobius:settings`.
  - `useStreamStatus()` — react-query hook → `StreamStatus`.
  - `usePlayStream()` — react-query mutation: `(req: StreamPlayRequest) => Promise<StreamPlayResponse>`.
  - `streamKeys` — query-key factory.

- [ ] **Step 1: Create the settings store**

Create `apps/web/src/stores/settingsStore.ts`:

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PlaybackMode = "vidcore" | "torrent";

type SettingsState = {
  playbackMode: PlaybackMode;
  setPlaybackMode: (mode: PlaybackMode) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      playbackMode: "vidcore",
      setPlaybackMode: (mode) => set({ playbackMode: mode }),
    }),
    { name: "mobius:settings" },
  ),
);
```

- [ ] **Step 2: Create the stream queries**

Create `apps/web/src/queries/stream.ts`:

```typescript
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  StreamPlayRequest,
  StreamPlayResponse,
  StreamStatus,
} from "@mobius/shared";

async function fetchStatus(): Promise<StreamStatus> {
  const res = await fetch("/api/stream/status");
  if (!res.ok) throw new Error(`stream/status failed: ${res.status}`);
  return res.json() as Promise<StreamStatus>;
}

async function postPlay(req: StreamPlayRequest): Promise<StreamPlayResponse> {
  const res = await fetch("/api/stream/play", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw Object.assign(new Error(body.error ?? `play failed: ${res.status}`), {
      status: res.status,
      code: body.error,
    });
  }
  return res.json() as Promise<StreamPlayResponse>;
}

export const streamKeys = {
  status: ["stream", "status"] as const,
};

export function useStreamStatus() {
  return useQuery({
    queryKey: streamKeys.status,
    queryFn: fetchStatus,
    staleTime: 30_000,
    retry: false,
  });
}

export function usePlayStream() {
  return useMutation({ mutationFn: postPlay });
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck -w @mobius/web`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/stores/settingsStore.ts apps/web/src/queries/stream.ts
git commit -m "feat(web): settings store + stream status/play queries

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 11: TorrentWatch component + WatchRoute branch + settings toggle

**Files:**
- Create: `apps/web/src/streaming/components/TorrentWatch.tsx`
- Create: `apps/web/src/streaming/components/SettingsMenu.tsx`
- Modify: `apps/web/src/routes/WatchRoute.tsx`
- Modify: `apps/web/src/streaming/components/TopNav.tsx`
- Modify: `apps/web/src/streaming/styles/dark-morphism.css`

**Interfaces:**
- Consumes: `useSettingsStore`, `useStreamStatus`, `usePlayStream` (Task 10); `Watch` (existing); `getPlaybackPosition`/`setPlaybackPosition` (existing `playbackPositions.ts`); shared `StreamSource`.
- Produces: `TorrentWatch` (default-less named export) and `SettingsMenu` components; WatchRoute renders one of `Watch` / `TorrentWatch`.

- [ ] **Step 1: Create the TorrentWatch component**

Create `apps/web/src/streaming/components/TorrentWatch.tsx`:

```typescript
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Layers } from "lucide-react";
import type { MediaKind, StreamSource } from "@mobius/shared";
import { usePlayStream } from "../../queries/stream";
import {
  getPlaybackPosition,
  setPlaybackPosition,
} from "../../lib/playbackPositions";
import { LoadingOverlay } from "../../auth/components/LoadingOverlay";

type Props = {
  kind: MediaKind;
  id: number;
  season?: number;
  episode?: number;
  title: string;
  onClose: () => void;
  onFallback: () => void;
};

function gb(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function posKey(kind: MediaKind, id: number, s?: number, e?: number): string {
  return kind === "tv" ? `torrent:tv:${id}:${s ?? 1}:${e ?? 1}` : `torrent:movie:${id}`;
}

export function TorrentWatch({
  kind,
  id,
  season,
  episode,
  title,
  onClose,
  onFallback,
}: Props) {
  const play = usePlayStream();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState(false);
  const key = useMemo(
    () => posKey(kind, id, season, episode),
    [kind, id, season, episode],
  );

  // Kick off the initial play on mount / when the title changes.
  useEffect(() => {
    setStreamUrl(null);
    setDecodeError(false);
    play.mutate(
      { kind, id, s: season, e: episode },
      {
        onSuccess: (data) => {
          setSources(data.sources);
          setActiveId(data.source.id);
          setStreamUrl(data.streamUrl);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, season, episode]);

  const selectSource = (sourceId: string) => {
    setDrawerOpen(false);
    setDecodeError(false);
    setStreamUrl(null);
    play.mutate(
      { kind, id, s: season, e: episode, sourceId },
      {
        onSuccess: (data) => {
          setActiveId(data.source.id);
          setStreamUrl(data.streamUrl);
          if (data.sources.length) setSources(data.sources);
        },
      },
    );
  };

  // Resume + persist position.
  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    const saved = getPlaybackPosition(key);
    if (saved && saved < v.duration - 5) v.currentTime = saved;
  };
  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (v && !v.paused) setPlaybackPosition(key, v.currentTime);
  };

  const isLoading = play.isPending && !streamUrl;
  const noSources =
    play.isError &&
    (play.error as { code?: string } | undefined)?.code === "no_sources";

  return (
    <div className="dm-watch">
      {streamUrl && (
        <video
          ref={videoRef}
          className="dm-watch__frame"
          src={streamUrl}
          autoPlay
          controls
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onError={() => setDecodeError(true)}
        />
      )}

      {isLoading && (
        <div className="dm-torrent__overlay">
          <LoadingOverlay caption="Møbius" sub="FINDING A STREAM" />
        </div>
      )}

      {(noSources || (play.isError && !noSources)) && (
        <div className="dm-torrent__overlay dm-torrent__message">
          <div>
            {noSources
              ? "No torrent sources found."
              : "Couldn't start this stream."}
          </div>
          <div className="dm-torrent__actions">
            {sources.length > 0 && (
              <button
                type="button"
                className="dm-btn dm-btn--glass"
                onClick={() => setDrawerOpen(true)}
              >
                Choose a source
              </button>
            )}
            <button type="button" className="dm-btn dm-btn--glass" onClick={onFallback}>
              Play via VidCore
            </button>
          </div>
        </div>
      )}

      {decodeError && streamUrl && (
        <div className="dm-torrent__decode">
          This release can't play in the browser — pick another source.
          <button
            type="button"
            className="dm-btn dm-btn--glass"
            onClick={() => setDrawerOpen(true)}
          >
            Sources
          </button>
        </div>
      )}

      <div className="dm-torrent__bar">
        <button
          type="button"
          className="dm-watch__back"
          onClick={onClose}
          aria-label="Back"
        >
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>
        <span className="dm-torrent__title">{title}</span>
        {sources.length > 0 && (
          <button
            type="button"
            className="dm-btn dm-btn--glass dm-torrent__sources-btn"
            onClick={() => setDrawerOpen((o) => !o)}
          >
            <Layers size={16} />
            <span>Sources</span>
          </button>
        )}
      </div>

      {drawerOpen && (
        <aside className="dm-torrent__drawer">
          <div className="dm-torrent__drawer-head">Sources</div>
          <ul className="dm-torrent__list">
            {sources.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={
                    "dm-torrent__source" + (s.id === activeId ? " active" : "")
                  }
                  onClick={() => selectSource(s.id)}
                >
                  <span className="dm-torrent__source-title">{s.title}</span>
                  <span className="dm-torrent__source-meta">
                    {s.resolution && <em>{s.resolution}</em>}
                    <span>{gb(s.sizeBytes)}</span>
                    <span>▲ {s.seeders}</span>
                    {s.isSeasonPack && <em className="pack">PACK</em>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Branch WatchRoute**

Replace the body of `apps/web/src/routes/WatchRoute.tsx` from the `const src =` line through the final `return` with a mode-aware branch. The full updated file:

```typescript
import { useNavigate, useParams, useSearchParams } from "react-router";
import type { MediaKind } from "@mobius/shared";
import { LoadingOverlay } from "../auth/components/LoadingOverlay";
import { useTitle } from "../queries/catalog";
import { vidcoreMovieUrl, vidcoreTvUrl } from "../lib/vidcore";
import { Watch } from "../streaming/components/Watch";
import { TorrentWatch } from "../streaming/components/TorrentWatch";
import { useSettingsStore } from "../stores/settingsStore";
import { useStreamStatus } from "../queries/stream";

function isKind(value: string | undefined): value is MediaKind {
  return value === "movie" || value === "tv";
}

function parsePositive(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function WatchRoute() {
  const params = useParams<{ kind: string; id: string }>();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const kind = isKind(params.kind) ? params.kind : undefined;
  const numericId = params.id ? Number(params.id) : NaN;
  const id = Number.isFinite(numericId) ? numericId : undefined;

  const playbackMode = useSettingsStore((s) => s.playbackMode);
  const { data: status } = useStreamStatus();
  const { data: item, isPending, isError } = useTitle(kind, id);

  if (!kind || id === undefined) {
    return (
      <FullScreenMessage
        message="Bad URL."
        onBack={() => navigate("/", { replace: true })}
      />
    );
  }

  if (isPending) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--dm-void)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <LoadingOverlay caption="Møbius" sub="LOADING" />
      </div>
    );
  }

  if (isError || !item) {
    return (
      <FullScreenMessage
        message="Title not found."
        onBack={() => navigate("/", { replace: true })}
      />
    );
  }

  const season = parsePositive(search.get("s"), 1);
  const episode = parsePositive(search.get("e"), 1);

  const useTorrent = playbackMode === "torrent" && status?.available === true;

  // Shared vidcore renderer (also the torrent fallback target).
  const renderVidcore = () => {
    const src =
      kind === "movie"
        ? vidcoreMovieUrl(id)
        : vidcoreTvUrl(id, season, episode);
    return <Watch src={src} title={item.title} onClose={() => navigate(-1)} />;
  };

  if (useTorrent) {
    return (
      <TorrentWatch
        kind={kind}
        id={id}
        season={kind === "tv" ? season : undefined}
        episode={kind === "tv" ? episode : undefined}
        title={item.title}
        onClose={() => navigate(-1)}
        onFallback={() => useSettingsStore.getState().setPlaybackMode("vidcore")}
      />
    );
  }

  return renderVidcore();
}

function FullScreenMessage({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--dm-void)",
        color: "var(--dm-fg-1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div>{message}</div>
      <button type="button" className="dm-btn dm-btn--glass" onClick={onBack}>
        Back to home
      </button>
    </div>
  );
}
```

Note: `onFallback` flips the persisted mode to vidcore, so the same route immediately re-renders the vidcore player (the toggle is the single source of truth). The user can flip back to torrent mode later from Settings.

- [ ] **Step 3: Create the SettingsMenu**

Create `apps/web/src/streaming/components/SettingsMenu.tsx`:

```typescript
import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useStreamStatus } from "../../queries/stream";

export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const playbackMode = useSettingsStore((s) => s.playbackMode);
  const setPlaybackMode = useSettingsStore((s) => s.setPlaybackMode);
  const { data: status } = useStreamStatus();
  const available = status?.available === true;
  const torrentOn = playbackMode === "torrent";

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="dm-settings" ref={ref}>
      <button
        type="button"
        className="dm-nav__icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Settings"
      >
        <Settings size={20} />
      </button>
      {open && (
        <div className="dm-settings__popover">
          <div className="dm-settings__row">
            <div className="dm-settings__label">
              <span>Torrent streaming</span>
              <small>
                {available
                  ? "Stream via Jackett + TorrServer"
                  : "Jackett/TorrServer not reachable"}
              </small>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={torrentOn}
              disabled={!available}
              className={
                "dm-switch" +
                (torrentOn ? " on" : "") +
                (available ? "" : " disabled")
              }
              onClick={() =>
                setPlaybackMode(torrentOn ? "vidcore" : "torrent")
              }
            >
              <span className="dm-switch__thumb" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Mount SettingsMenu in TopNav**

In `apps/web/src/streaming/components/TopNav.tsx`, add the import:

```typescript
import { SettingsMenu } from "./SettingsMenu";
```

Then add `<SettingsMenu />` immediately before the notifications button (the `<button ... aria-label="Notifications">`):

```typescript
      <SettingsMenu />
      <button
        type="button"
        className="dm-nav__icon-btn"
        aria-label="Notifications"
      >
        <Bell size={20} />
      </button>
```

- [ ] **Step 5: Add styles**

Append to `apps/web/src/streaming/styles/dark-morphism.css`:

```css
/* ---- Settings toggle ---- */
.dm-settings {
  position: relative;
  display: inline-flex;
}
.dm-settings__popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 280px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(18, 18, 22, 0.92);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  z-index: 60;
}
.dm-settings__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dm-settings__label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dm-settings__label small {
  color: var(--dm-fg-3, rgba(255, 255, 255, 0.5));
  font-size: 11px;
}
.dm-switch {
  position: relative;
  width: 44px;
  height: 26px;
  border-radius: 999px;
  border: none;
  background: rgba(255, 255, 255, 0.16);
  cursor: pointer;
  transition: background 0.2s ease;
  flex: 0 0 auto;
}
.dm-switch.on {
  background: var(--dm-accent, #c9a96a);
}
.dm-switch.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dm-switch__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s ease;
}
.dm-switch.on .dm-switch__thumb {
  transform: translateX(18px);
}

/* ---- Torrent player ---- */
.dm-torrent__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--dm-void, #0a0a0c);
  z-index: 20;
}
.dm-torrent__message {
  flex-direction: column;
  gap: 16px;
  color: var(--dm-fg-1, #fff);
}
.dm-torrent__actions {
  display: flex;
  gap: 12px;
}
.dm-torrent__decode {
  position: absolute;
  top: 80px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-radius: 12px;
  background: rgba(20, 20, 24, 0.9);
  color: #fff;
  z-index: 40;
}
.dm-torrent__bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
  z-index: 30;
}
.dm-torrent__title {
  color: #fff;
  font-weight: 600;
}
.dm-torrent__sources-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dm-torrent__drawer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(420px, 90vw);
  padding: 24px 18px;
  overflow-y: auto;
  background: rgba(12, 12, 15, 0.96);
  backdrop-filter: blur(20px);
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  z-index: 50;
}
.dm-torrent__drawer-head {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 16px;
}
.dm-torrent__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dm-torrent__source {
  width: 100%;
  text-align: left;
  padding: 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.03);
  color: #fff;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dm-torrent__source.active {
  border-color: var(--dm-accent, #c9a96a);
}
.dm-torrent__source-title {
  font-size: 13px;
  word-break: break-word;
}
.dm-torrent__source-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--dm-fg-3, rgba(255, 255, 255, 0.55));
}
.dm-torrent__source-meta em {
  font-style: normal;
  color: var(--dm-accent, #c9a96a);
}
.dm-torrent__source-meta em.pack {
  color: #7aa2ff;
}
```

- [ ] **Step 6: Typecheck and build the web app**

Run: `npm run typecheck -w @mobius/web && npm run build -w @mobius/web`
Expected: PASS, production bundle builds.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/streaming/components/TorrentWatch.tsx apps/web/src/streaming/components/SettingsMenu.tsx apps/web/src/routes/WatchRoute.tsx apps/web/src/streaming/components/TopNav.tsx apps/web/src/streaming/styles/dark-morphism.css
git commit -m "feat(web): torrent player, settings toggle, WatchRoute branch

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 12: Full test run + manual integration verification

**Files:** none (verification only).

- [ ] **Step 1: Run the API unit suite**

Run: `npm test -w @mobius/api`
Expected: PASS — all `rank`, `files`, and `env` tests green.

- [ ] **Step 2: Typecheck the whole monorepo**

Run: `npm run typecheck`
Expected: PASS across shared, api, web.

- [ ] **Step 3: Manual integration (requires local Jackett + TorrServer running)**

Prerequisites: `apps/api/.env` has a valid `TMDB_READ_ACCESS_TOKEN` and `JACKETT_API_KEY`; Jackett is reachable at `JACKETT_URL` with at least one indexer configured; TorrServer is reachable at `TORRSERVER_URL`.

Start both dev servers: `npm run dev` (turbo runs api on :3001 and web on :5173).

Verify each flow and check it off:
- [ ] `curl -s localhost:3001/api/stream/status` → `{"available":true,"jackett":"ok","torrserver":"ok"}`
- [ ] In the web app, open Settings (gear in the top-nav) → the Torrent switch is enabled; toggle it on.
- [ ] Open a **movie**, press Play → "Finding a stream…" then native video plays.
- [ ] Open the **Sources** drawer → ranked list shows; click a different source → stream swaps.
- [ ] Open a **TV episode** (a title where a per-episode torrent exists) → plays the right episode.
- [ ] Open a **TV episode only available as a season pack** → correct episode file is selected.
- [ ] Stop TorrServer, reload → status flips to unavailable, Settings switch disabled, Play falls back to vidcore with no error screen.
- [ ] With torrent mode toggled **off**, Play uses vidcore exactly as before (regression check).

- [ ] **Step 4: Final commit (if any doc/notes changed)**

If verification surfaced small fixes, commit them:

```bash
git add -A
git commit -m "fix(stream): address manual integration findings

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

If no changes were needed, skip this step.

---

## Self-Review Notes

**Spec coverage:**
- Config & availability (`/status`, optional env, gating) → Tasks 2, 9.
- Search ladder (imdb→text; TV episode + season pack) → Task 7.
- Ranking (filters, scoring, year guard, pack tagging) → Task 3.
- TorrServer add + metadata poll + file pick → Tasks 4, 8, 9.
- Direct stream URL (public url) → Tasks 2, 8.
- Web toggle (persisted, availability-aware) → Tasks 10, 11.
- WatchRoute branch + silent fallback → Task 11.
- Native `<video>` + Sources drawer + resume via `playbackPositions` → Task 11.
- Error handling matrix (`StreamError` + UI states) → Tasks 6, 9, 11.
- Shared types → Task 1.
- Unit tests (rank, files) + manual integration → Tasks 3, 4, 12.

**Type consistency:** `StreamSource`, `StreamPlayRequest`, `StreamPlayResponse`, `StreamStatus` defined once in Task 1 and imported everywhere. `Candidate`/`RankContext` internal to the api `stream/` module. `rankSources`, `pickVideoFile`, `searchJackett`, `addAndResolve`, `buildStreamUrl` signatures are consistent between producer tasks and the Task 9 consumer.

**Known adjustment point:** `parse-torrent-title` field names (`resolution`, `source`, `codec`, `season`, `episode`, `year`, `complete`) — verified against its documented API; if any differ at implementation time, adjust the `Parsed` mapping in `rank.ts`/`files.ts` while keeping the tests as the behavioral contract.
