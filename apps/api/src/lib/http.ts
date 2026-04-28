import { env } from "../env.js";
import { logger } from "./logger.js";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TIMEOUT_MS = 8000;
const RETRY_DELAY_MS = 250;

export class TmdbError extends Error {
  status: number;
  upstreamMessage?: string;

  constructor(status: number, message: string, upstreamMessage?: string) {
    super(message);
    this.name = "TmdbError";
    this.status = status;
    this.upstreamMessage = upstreamMessage;
  }
}

type Params = Record<string, string | number | boolean | undefined>;

function buildUrl(path: string, params?: Params): string {
  const url = new URL(TMDB_BASE + (path.startsWith("/") ? path : `/${path}`));
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function tryParseJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

function pickStatusMessage(body: unknown): string | undefined {
  if (body && typeof body === "object" && "status_message" in body) {
    const m = (body as { status_message?: unknown }).status_message;
    if (typeof m === "string") return m;
  }
  return undefined;
}

export async function tmdbFetch<T>(path: string, params?: Params): Promise<T> {
  const url = buildUrl(path, params);
  const headers = {
    Authorization: `Bearer ${env.TMDB_READ_ACCESS_TOKEN}`,
    accept: "application/json",
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const started = Date.now();
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const elapsed = Date.now() - started;
      logger.debug({ path, status: res.status, elapsed_ms: elapsed }, "tmdb upstream call");

      if (res.ok) {
        return (await res.json()) as T;
      }

      const body = await tryParseJson(res);
      const upstreamMessage = pickStatusMessage(body);

      // Retry once on 5xx; don't retry on 4xx.
      if (res.status >= 500 && attempt === 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }

      throw new TmdbError(
        res.status,
        `TMDB ${res.status} on ${path}`,
        upstreamMessage,
      );
    } catch (err) {
      if (err instanceof TmdbError) throw err;
      lastErr = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
    }
  }

  throw new TmdbError(
    502,
    `TMDB request failed for ${path}`,
    lastErr instanceof Error ? lastErr.message : undefined,
  );
}
