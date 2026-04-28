import { Router, type Request, type Response, type NextFunction } from "express";
import { TTL } from "../lib/cache.js";
import { tmdb, type TrendingMedia, type TrendingWindow } from "../tmdb/client.js";
import { toMediaList, toMovieDetail, toTvDetail } from "../tmdb/normalize.js";

export const tmdbRouter = Router();

const cacheSeconds = (ttlMs: number) => Math.floor(ttlMs / 1000);

function setCache(res: Response, ttlMs: number) {
  res.set("Cache-Control", `public, max-age=${cacheSeconds(ttlMs)}`);
}

function pageOf(req: Request): number {
  const raw = req.query.page;
  if (typeof raw !== "string") return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

tmdbRouter.get(
  "/trending",
  asyncHandler(async (req, res) => {
    const window = (req.query.window === "day" ? "day" : "week") as TrendingWindow;
    const mediaParam = req.query.media;
    const media: TrendingMedia =
      mediaParam === "movie" || mediaParam === "tv" ? mediaParam : "all";
    const data = await tmdb.trending({ window, media });
    setCache(res, TTL.list);
    res.json(await toMediaList(data, media));
  }),
);

tmdbRouter.get(
  "/popular/movies",
  asyncHandler(async (req, res) => {
    const data = await tmdb.popularMovies({ page: pageOf(req) });
    setCache(res, TTL.list);
    res.json(await toMediaList(data, "movie"));
  }),
);

tmdbRouter.get(
  "/popular/tv",
  asyncHandler(async (req, res) => {
    const data = await tmdb.popularTv({ page: pageOf(req) });
    setCache(res, TTL.list);
    res.json(await toMediaList(data, "tv"));
  }),
);

tmdbRouter.get(
  "/top-rated/movies",
  asyncHandler(async (req, res) => {
    const data = await tmdb.topRatedMovies({ page: pageOf(req) });
    setCache(res, TTL.list);
    res.json(await toMediaList(data, "movie"));
  }),
);

tmdbRouter.get(
  "/top-rated/tv",
  asyncHandler(async (req, res) => {
    const data = await tmdb.topRatedTv({ page: pageOf(req) });
    setCache(res, TTL.list);
    res.json(await toMediaList(data, "tv"));
  }),
);

tmdbRouter.get(
  "/upcoming/movies",
  asyncHandler(async (req, res) => {
    const data = await tmdb.upcomingMovies({ page: pageOf(req) });
    setCache(res, TTL.list);
    res.json(await toMediaList(data, "movie"));
  }),
);

tmdbRouter.get(
  "/now-playing/movies",
  asyncHandler(async (req, res) => {
    const data = await tmdb.nowPlayingMovies({ page: pageOf(req) });
    setCache(res, TTL.list);
    res.json(await toMediaList(data, "movie"));
  }),
);

tmdbRouter.get(
  "/airing-today/tv",
  asyncHandler(async (req, res) => {
    const data = await tmdb.airingTodayTv({ page: pageOf(req) });
    setCache(res, TTL.list);
    res.json(await toMediaList(data, "tv"));
  }),
);

tmdbRouter.get(
  "/movie/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const detail = await tmdb.movieDetail(id);
    setCache(res, TTL.detail);
    res.json(await toMovieDetail(detail));
  }),
);

tmdbRouter.get(
  "/tv/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const detail = await tmdb.tvDetail(id);
    setCache(res, TTL.detail);
    res.json(await toTvDetail(detail));
  }),
);

tmdbRouter.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length === 0) {
      res.status(400).json({ error: "missing_q" });
      return;
    }
    const data = await tmdb.search({ q, page: pageOf(req) });
    setCache(res, TTL.search);
    res.json(await toMediaList(data, "all"));
  }),
);

tmdbRouter.get(
  "/genres/movies",
  asyncHandler(async (_req, res) => {
    const data = await tmdb.movieGenres();
    setCache(res, TTL.genres);
    res.json(data);
  }),
);

tmdbRouter.get(
  "/genres/tv",
  asyncHandler(async (_req, res) => {
    const data = await tmdb.tvGenres();
    setCache(res, TTL.genres);
    res.json(data);
  }),
);
