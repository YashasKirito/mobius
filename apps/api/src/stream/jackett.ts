import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
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
  // Hit the Torznab endpoint (apikey-authenticated, same path searches use)
  // rather than the admin `/api/v2.0/indexers` route, which redirects to the
  // UI login when an admin password is set.
  const url = `${env.jackettUrl}/api/v2.0/indexers/all/results/torznab/api?apikey=${env.jackettApiKey}&t=caps`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

export type JackettSearchParams = {
  kind: "movie" | "tv";
  title: string;
  year: number | null;
  imdbId: string | null;
  season?: number;
  episode?: number;
};

type TorznabQuery = Record<string, string>;

// Ordered query ladder. Movies: stop at the first tier with results.
// TV: run all tiers and merge (episode results + season pack).
function buildQueries(
  p: JackettSearchParams,
): { fromImdb: boolean; q: TorznabQuery }[] {
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
    // Season-pack tiers.
    if (imdb) {
      out.push({
        fromImdb: true,
        q: { t: "tvsearch", imdbid: `tt${imdb}`, season: String(s) },
      });
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

type Attr = { "@_name"?: string; "@_value"?: string };

type TorznabItem = {
  title?: string;
  link?: string;
  size?: string | number;
  jackettindexer?: string | { "#text"?: string };
  "torznab:attr"?: Attr | Attr[];
  enclosure?:
    | { "@_url"?: string; "@_type"?: string }
    | { "@_url"?: string; "@_type"?: string }[];
};

function attrMap(item: TorznabItem): Record<string, string> {
  const map: Record<string, string> = {};
  for (const a of toArray(item["torznab:attr"])) {
    const name = a["@_name"];
    const value = a["@_value"];
    if (name != null && value != null) map[name] = value;
  }
  return map;
}

function magnetFrom(
  item: TorznabItem,
  attrs: Record<string, string>,
): string | undefined {
  if (attrs.magneturl && attrs.magneturl.startsWith("magnet:")) {
    return attrs.magneturl;
  }
  for (const enc of toArray(item.enclosure)) {
    const url = enc["@_url"];
    if (url && url.startsWith("magnet:")) return url;
  }
  if (typeof item.link === "string" && item.link.startsWith("magnet:")) {
    return item.link;
  }
  return undefined;
}

function linkFrom(item: TorznabItem): string | undefined {
  if (typeof item.link === "string" && !item.link.startsWith("magnet:")) {
    return item.link;
  }
  for (const enc of toArray(item.enclosure)) {
    const url = enc["@_url"];
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

async function runQuery(env: StreamEnv, q: TorznabQuery): Promise<Candidate[]> {
  const url = new URL(
    `${env.jackettUrl}/api/v2.0/indexers/all/results/torznab/api`,
  );
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
  params: JackettSearchParams,
): Promise<Candidate[]> {
  // Imdb tiers run first so a trusted result wins the de-dup over a text-search
  // duplicate. All tiers merge — imdb-id search alone returns a thin pool (most
  // indexers ignore imdbid), so the text tier supplies the volume the ranker
  // needs, while the per-candidate `trusted` flag keeps the year guard honest.
  const ladder = buildQueries(params);

  // Run the tiers concurrently (each is a slow aggregate call across indexers);
  // allSettled keeps the results ordered by tier and tolerates a single tier
  // failing. Only a total wipe-out counts as a search failure.
  const settled = await Promise.allSettled(
    ladder.map((tier) =>
      runQuery(env, tier.q).then((results) => ({ tier, results })),
    ),
  );
  const succeeded = settled.filter(
    (s): s is PromiseFulfilledResult<{ tier: (typeof ladder)[number]; results: Candidate[] }> =>
      s.status === "fulfilled",
  );
  if (succeeded.length === 0) {
    const firstError =
      settled[0]?.status === "rejected" ? settled[0].reason : undefined;
    logger.warn({ err: firstError }, "jackett search failed");
    throw new StreamError(502, "search_failed", "Jackett search failed");
  }

  const merged = new Map<string, Candidate>();
  for (const { value } of succeeded) {
    for (const c of value.results) {
      if (!merged.has(c.id)) {
        merged.set(c.id, { ...c, trusted: value.tier.fromImdb });
      }
    }
  }

  return [...merged.values()];
}
