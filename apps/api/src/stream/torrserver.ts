import { logger } from "../lib/logger.js";
import { StreamError } from "./errors.js";
import type { StreamEnv } from "./env.js";
import type { TorrentFile } from "./files.js";

const META_TIMEOUT_MS = 45_000;
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
  if (!res.ok) {
    throw new StreamError(502, "search_failed", `torrserver ${res.status}`);
  }
  return (await res.json()) as TorrentState;
}

async function addMagnet(
  env: StreamEnv,
  magnet: string,
  title: string,
): Promise<string> {
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
  if (!dl.ok) {
    throw new StreamError(502, "search_failed", "torrent download failed");
  }
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
  if (!state.hash) {
    throw new StreamError(502, "search_failed", "no hash from upload");
  }
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
  let hash: string;
  if (opts.magnet) {
    hash = await addMagnet(env, opts.magnet, opts.title);
  } else if (opts.linkUrl) {
    hash = await uploadTorrentFile(env, opts.linkUrl, opts.title);
  } else {
    throw new StreamError(502, "search_failed", "source has no magnet or link");
  }

  const deadline = Date.now() + META_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const state = await torrentsApi(env, { action: "get", hash });
    const stats = state.file_stats;
    if (stats && stats.length > 0) {
      return { hash, files: toFiles(stats) };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  logger.warn({ hash }, "torrserver metadata timeout");
  throw new StreamError(
    504,
    "torrent_timeout",
    "Timed out fetching torrent metadata",
  );
}

export function buildStreamUrl(
  env: StreamEnv,
  opts: { hash: string; fileName: string; index: number },
): string {
  const name = encodeURIComponent(opts.fileName);
  return `${env.torrserverPublicUrl}/stream/${name}?link=${opts.hash}&index=${opts.index}&play`;
}
