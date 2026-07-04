# Torrent Streaming Mode — Design

**Date:** 2026-07-05
**Status:** Approved
**Scope:** Personal, locally-run server only. Never deployed publicly or used commercially.

## Summary

Add a second playback mode to mobius that resolves streams from torrents instead of the
vidcore.net embed. The Express API orchestrates two existing self-hosted services — no
torrent logic is built from scratch:

- **Jackett** (`http://127.0.0.1:9117`) — meta-search across torrent indexers.
- **TorrServer** (`http://127.0.0.1:8090`) — turns a magnet/torrent into an HTTP video stream.

The user flips a **Torrents** toggle in the UI. Play then: searches Jackett (IMDb id
first, raw text fallback), ranks candidates (seeds / size / resolution / source /
codec), loads the best pick into TorrServer, and plays the resulting stream URL in a
native `<video>` element. A Sources drawer allows manual override.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Playback surface | Native in-app `<video>` player (no external-player handoff in v1) |
| TV support | Movies **and** TV in v1, incl. season-pack file matching |
| Source selection | Auto-pick + manual override via a Sources drawer in the player |
| Quality target | 1080p sweet spot (prefer 1080p x264/WEB-DL, sane sizes) |
| Mode switch | Manual toggle, availability-aware, persisted in localStorage |
| Architecture | Server-orchestrated: Express API does the pipeline; browser streams directly from TorrServer |

## Architecture

```
Browser (React)                    Express API (local)            Local services
──────────────                     ───────────────────            ──────────────
Settings toggle ──────────────────▶ GET /api/stream/status ──────▶ Jackett ping
                                                        └────────▶ TorrServer ping
Play (torrent mode)───────────────▶ POST /api/stream/play
                                      1. TMDB external_ids ──────▶ TMDB (imdb id)
                                      2. Torznab search ─────────▶ Jackett
                                      3. rank/pick (pure fns)
                                      4. add + file pick ────────▶ TorrServer
                                      ◀── {streamUrl, sources[]}
<video src=streamUrl> ════════════════════ video bytes ═════════▶ TorrServer /stream
```

Video bytes never pass through Express; the `<video>` element talks straight to
TorrServer so seeking uses native HTTP range requests.

## 1. Configuration & availability

New **optional** env vars in `apps/api/.env` (absence ⇒ torrent mode unavailable,
all other behavior untouched — this is what the Vercel deployment sees):

| Var | Default | Purpose |
|---|---|---|
| `JACKETT_URL` | `http://127.0.0.1:9117` | Jackett base URL |
| `JACKETT_API_KEY` | — (gates the feature) | Jackett auth |
| `TORRSERVER_URL` | `http://127.0.0.1:8090` | TorrServer, server-side calls |
| `TORRSERVER_PUBLIC_URL` | = `TORRSERVER_URL` | Base for stream URLs returned to the browser; set to the Mac's LAN IP when watching from other devices |

`env.ts` keeps its `required()` behavior for existing vars; the new ones are optional
with defaults.

### `GET /api/stream/status`

Returns `{ available: boolean, jackett: "ok"|"unreachable"|"unconfigured", torrserver: "ok"|"unreachable"|"unconfigured" }`.
`available` is true only when both are `"ok"`. Result cached 30 s (existing `lru-cache`).
Pings: Jackett `GET /api/v2.0/indexers?configured=true` (with API key), TorrServer `GET /echo`.

## 2. Search & ranking

### `GET /api/stream/sources?kind=movie|tv&id=<tmdbId>&s=<season>&e=<episode>`

1. **Metadata**: TMDB title + year (existing client) and `GET /{kind}/{id}/external_ids`
   → `imdb_id` (new TMDB client method, cached like other TMDB calls).
2. **Jackett search** via the Torznab aggregate endpoint
   `GET {JACKETT_URL}/api/v2.0/indexers/all/results/torznab/api?apikey=…`, XML parsed
   with `fast-xml-parser`. Query ladder (stop at first non-empty tier for movies;
   for TV, episode tiers and the season-pack tier are merged into one pool):
   - **Movie**: ① `t=movie&imdbid=tt…` ② `t=search&q={title} {year}`
   - **TV episode**: ① `t=tvsearch&imdbid=tt…&season=S&ep=E`
     ② `t=search&q={title} S00E00` ③ season pack: `t=tvsearch&…&season=S` (and raw
     `q={title} S00` fallback), candidates tagged `isSeasonPack`.
3. **Parse release names** with `parse-torrent-title` (resolution, source, codec,
   season/episode, year). No hand-rolled release-name parsing.
4. **Hard filters** (reject):
   - `seeders < 1`
   - CAM / TS / TC / HDCAM / SCREENER sources
   - Size out of bounds — movie: 0.7–12 GB; single episode: 0.1–4 GB; season packs
     exempt from the episode bound (sanity cap 80 GB)
   - Movies from **text search**: parsed year differs from TMDB year by more than 1
     (IMDb-search results skip this check)
   - TV: parsed S/E must match the request, or be a season pack for the right season
5. **Score** (descending sort; weights tuned for the 1080p sweet spot):
   - Resolution: 1080p = 100, 720p = 70, 2160p = 55, 480p/unknown = 30
   - Seeders: `min(40, 10 * log10(seeders + 1) * 2)` — healthy swarm beats marginal quality
   - Source: WEB-DL/BluRay +25, WEBRip +15, HDTV +5
   - Codec: x264/H.264 +15; x265/HEVC/AV1 −10 (browser decode risk)
   - Size proximity: movies ideal 2–6 GB (+10 inside, linear falloff); episodes ideal 0.5–2.5 GB
   - Season pack: −5 (slower to start; still viable)
6. Respond with top **20** as `StreamSource[]`; full ranked list cached **10 min**
   per `(kind,id,s,e)` in `lru-cache` so the Sources drawer and re-picks don't re-hit Jackett.

`StreamSource`: `{ id, title, indexer, sizeBytes, seeders, leechers, resolution, source, codec, isSeasonPack, magnet?, linkUrl?, score }`.
`id` is a stable hash of magnet-or-link for use as `sourceId`.

Timeout: 25 s on the Jackett request (aggregate searches are slow).

## 3. Playback resolution (TorrServer)

### `POST /api/stream/play` — body `{ kind, id, s?, e?, sourceId? }`

1. Resolve sources (from the 10-min cache or fresh). No `sourceId` ⇒ top-ranked pick;
   with `sourceId` ⇒ that entry.
2. **Add to TorrServer**: `POST {TORRSERVER_URL}/torrents`
   `{ action: "add", link: <magnet>, title, poster, save_to_db: true }`.
   If the source has no magnet (private indexers give a Jackett `.torrent` proxy link),
   the API downloads the `.torrent` and posts it to `POST /torrent/upload`
   (multipart, `save true`). `save_to_db: true` means TorrServer acts as a cache and
   replays start instantly; pruning is done in TorrServer's own UI.
3. **Wait for metadata**: poll `POST /torrents {action:"get", hash}` every 1 s until
   `file_stats` is non-empty; 30 s timeout.
4. **Pick file index**:
   - Movie: largest file with a video extension (`.mp4 .mkv .avi .m4v .webm`)
   - TV: video file whose path parses (via `parse-torrent-title`) to the requested
     S/E; fallback = largest video file
5. **Respond**: `{ streamUrl, source, sources }` where
   `streamUrl = {TORRSERVER_PUBLIC_URL}/stream/{encodeURIComponent(fileName)}?link={hash}&index={index}&play`.

## 4. Web UI

- **`settingsStore`** (`apps/web/src/stores/settingsStore.ts`): zustand + `persist`
  middleware (localStorage), `{ playbackMode: "vidcore" | "torrent" }`. Default `"vidcore"`.
- **Settings surface**: small popover anchored to the TopNav profile button with the
  Torrents switch. It reads `useQuery(["stream-status"])`; when unavailable the switch
  is disabled with hint text ("Jackett/TorrServer not reachable").
- **`WatchRoute` branch**: `playbackMode === "torrent"` **and** status available →
  render `TorrentWatch`; otherwise the existing vidcore `Watch` (silent fallback when
  services are down — no dead-end screens).
- **`TorrentWatch`** (`apps/web/src/streaming/components/TorrentWatch.tsx`):
  - On mount: `POST /api/stream/play` (react-query mutation) with a full-screen
    "Finding a stream…" state (reuse `LoadingOverlay`).
  - Full-bleed `<video autoplay controls>` — **native controls in v1** — plus a
    dark-morphism overlay top bar: Back button (same behavior as `Watch`), title,
    and a **Sources** button.
  - **Sources drawer**: slide-in panel listing ranked sources — name, size (GB),
    seeders, resolution badge, season-pack tag. Clicking one re-issues `play` with
    that `sourceId` and swaps the video `src`.
  - **Resume**: wire `timeupdate`/`loadedmetadata` into the existing
    `playbackPositions.ts` (save throttled, restore on load) — something the vidcore
    iframe could never do.
- Routing stays `/watch/:kind/:id?s=&e=` — no URL changes.

## 5. Shared types

`packages/shared/src/stream.ts`, exported from the package index:
`StreamStatus`, `StreamSource`, `StreamPlayRequest`, `StreamPlayResponse`.
Used by both `apps/api` and `apps/web`.

## 6. Error handling

| Failure | API behavior | UI behavior |
|---|---|---|
| Jackett/TorrServer unconfigured or down | `/status` `available:false`; play routes 503 `stream_unconfigured` | Toggle disabled; WatchRoute silently uses vidcore |
| No results after all query tiers | 404 `no_sources` | "No torrent sources found" + "Play via VidCore" button |
| TorrServer add/metadata timeout | 504 `torrent_timeout` | Error notice; Sources drawer auto-opens to pick another |
| Jackett timeout/error | 502 `search_failed` | Same notice + vidcore fallback button |
| `<video>` decode error (e.g. DTS/AC3 audio) | — (client-side) | Overlay "This release can't play in the browser — pick another source"; Sources drawer auto-opens |

New error types follow the existing `TmdbError` pattern in the central error
middleware (`app.ts`).

## 7. Module layout (API)

```
apps/api/src/stream/
  env.ts          — optional stream config resolution
  jackett.ts      — torznab client (search ladder, XML→candidates)
  rank.ts         — pure: filter + score + sort (unit tested)
  torrserver.ts   — client: add, get, upload, stream URL builder
  files.ts        — pure: video-file & episode-file selection (unit tested)
  router.ts       — /api/stream/{status,sources,play}
```

## 8. Testing

- `vitest` added to `apps/api` (dev dep) — table-driven unit tests for `rank.ts`
  (filters, scoring order, year guard, pack tagging) and `files.ts` (episode
  matching inside season packs, video-extension pick).
- Manual integration pass against live local Jackett + TorrServer: movie play,
  episode play, season-pack episode play, manual source override, both-services-down
  fallback, vidcore mode regression.

## New dependencies

`apps/api`: `fast-xml-parser`, `parse-torrent-title`, `vitest` (dev). Nothing new in web.

## Out of scope (v1)

- Custom video player chrome (native controls first; skinning is a follow-up)
- External player handoff (VLC/IINA) and "copy stream link"
- Transcoding (TorrServer serves raw bytes; codec-incompatible releases are handled
  by picking a different source)
- Auto-advancing to the next episode in torrent mode
- Torrent cache management UI (use TorrServer's own web UI)
