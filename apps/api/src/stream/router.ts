import { Router, type NextFunction, type Request, type Response } from "express";
import type {
  StreamPlayRequest,
  StreamPlayResponse,
  StreamSource,
  StreamStatus,
} from "@mobius/shared";
import { cached } from "../lib/cache.js";
import { tmdb } from "../tmdb/client.js";
import {
  resolveStreamEnv,
  isStreamConfigured,
  isSubtitlesConfigured,
} from "./env.js";
import { StreamError } from "./errors.js";
import { pingJackett, searchJackett } from "./jackett.js";
import { pingTorrServer, addAndResolve, buildStreamUrl } from "./torrserver.js";
import { rankSources } from "./rank.js";
import { pickVideoFile } from "./files.js";
import {
  DEFAULT_SUB_LANGUAGES,
  downloadVtt,
  searchSubtitles,
} from "./subtitles.js";
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

    const candidates = await searchJackett(env, {
      kind,
      title,
      year,
      imdbId,
      season: s,
      episode: e,
    });

    const ctx: RankContext = { kind, year, season: s, episode: e };
    return rankSources(candidates, ctx).slice(0, 20);
  });
}

streamRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const status = await cached<StreamStatus>(
      "stream:status",
      STATUS_TTL,
      async () => {
        const env = resolveStreamEnv();
        if (!isStreamConfigured(env)) {
          return {
            available: false,
            jackett: "unconfigured",
            torrserver: "unconfigured",
          };
        }
        const [jackettOk, torrOk] = await Promise.all([
          pingJackett(env),
          pingTorrServer(env),
        ]);
        return {
          available: jackettOk && torrOk,
          jackett: jackettOk ? "ok" : "unreachable",
          torrserver: torrOk ? "ok" : "unreachable",
        };
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

    // Fast path: a full source was supplied (a remembered or hand-picked
    // selection). Skip the whole search+rank pipeline and load it directly.
    let chosen: StreamSource;
    let sources: StreamSource[] = [];
    if (body.source && (body.source.magnet || body.source.linkUrl)) {
      chosen = body.source;
    } else {
      sources = await resolveSources(kind, id, s, e);
      if (sources.length === 0) throw new StreamError(404, "no_sources");
      const picked =
        (body.sourceId
          ? sources.find((x) => x.id === body.sourceId)
          : undefined) ?? sources[0];
      if (!picked) throw new StreamError(404, "no_sources");
      chosen = picked;
    }

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
    const streamUrl = buildStreamUrl(env, { hash, fileName, index: file.index });

    const response: StreamPlayResponse = { streamUrl, source: chosen, sources };
    res.json(response);
  }),
);

const SUBS_TTL = 60 * 60 * 1000;
const VTT_TTL = 6 * 60 * 60 * 1000;

// Available subtitle tracks for a title (one per language). Empty when the
// OpenSubtitles key is absent, so the UI simply shows no CC option.
streamRouter.get(
  "/subtitles",
  asyncHandler(async (req, res) => {
    const env = resolveStreamEnv();
    if (!isSubtitlesConfigured(env)) {
      res.json({ tracks: [] });
      return;
    }
    const kind = parseKind(req.query.kind);
    const id = parseId(req.query.id);
    const s = optionalInt(req.query.s);
    const e = optionalInt(req.query.e);
    const languages =
      typeof req.query.languages === "string" && req.query.languages.length > 0
        ? req.query.languages.split(",").map((x) => x.trim()).filter(Boolean)
        : DEFAULT_SUB_LANGUAGES;

    let imdbId: string | null = null;
    try {
      imdbId = (await tmdb.externalIds({ kind, id })).imdb_id;
    } catch {
      imdbId = null;
    }

    const key = `subs:${kind}:${id}:${s ?? ""}:${e ?? ""}:${languages.join(",")}`;
    const { tracks } = await cached(key, SUBS_TTL, async () => ({
      tracks: await searchSubtitles(env, {
        kind,
        imdbId,
        season: s,
        episode: e,
        languages,
      }),
    }));
    res.json({ tracks });
  }),
);

// Serves a single subtitle as browser-native WebVTT. Downloaded (and quota
// spent) lazily, only when the user actually enables a track; cached 6h.
streamRouter.get(
  "/subtitles/file/:fileId",
  asyncHandler(async (req, res) => {
    const env = resolveStreamEnv();
    if (!isSubtitlesConfigured(env)) {
      throw new StreamError(503, "stream_unconfigured", "subtitles off");
    }
    const fileId = String(req.params.fileId);
    if (!/^\d+$/.test(fileId)) {
      throw new StreamError(400, "invalid_request", "bad file id");
    }
    const { vtt } = await cached(`subvtt:${fileId}`, VTT_TTL, async () => ({
      vtt: await downloadVtt(env, fileId),
    }));
    res.set("Content-Type", "text/vtt; charset=utf-8");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(vtt);
  }),
);
