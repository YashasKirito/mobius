import { Router, type NextFunction, type Request, type Response } from "express";
import type { HomeCatalog, HomeRow, MediaItem } from "@mobius/shared";
import { cached, TTL } from "../lib/cache.js";
import { tmdb } from "../tmdb/client.js";
import {
  getGenreLookup,
  pickLogoPath,
  toMovieDetail,
  toTvDetail,
  toTvSeasonDetail,
} from "../tmdb/normalize.js";
import { imageUrl } from "../tmdb/images.js";
import type { TmdbBaseMovie } from "../tmdb/types.js";

export const catalogRouter = Router();

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

async function buildItem(
  raw: TmdbBaseMovie,
  defaultKind: "movie" | "tv",
  genreLookup: Map<number, string>,
): Promise<MediaItem> {
  const kind =
    raw.media_type === "movie" || raw.media_type === "tv"
      ? raw.media_type
      : defaultKind;
  const tags = (raw.genre_ids ?? [])
    .map((id) => genreLookup.get(id))
    .filter((n): n is string => Boolean(n));
  const [posterUrl, backdropUrl] = await Promise.all([
    imageUrl(raw.poster_path, "poster"),
    imageUrl(raw.backdrop_path, "backdrop"),
  ]);
  const date = raw.release_date ?? raw.first_air_date;
  const year =
    date && date.length >= 4 && Number.isFinite(Number(date.slice(0, 4)))
      ? Number(date.slice(0, 4))
      : null;
  return {
    id: raw.id,
    kind,
    title: raw.title ?? raw.name ?? raw.original_title ?? "Untitled",
    overview: raw.overview ?? "",
    releaseYear: year,
    runtime: null,
    rating: "",
    match: Math.round(((raw.vote_average ?? 0) as number) * 10),
    tags,
    posterUrl,
    backdropUrl,
    logoUrl: null,
  };
}

async function enrichLogo<T extends MediaItem>(item: T): Promise<T> {
  try {
    const bundle = await tmdb.images({ kind: item.kind, id: item.id });
    const path = pickLogoPath(bundle.logos);
    const logoUrl = await imageUrl(path, "logo", "w300");
    return { ...item, logoUrl };
  } catch {
    return item;
  }
}

async function loadHome(): Promise<HomeCatalog> {
  const [trending, popularMovies, popularTv, topRatedMovies, nowPlaying] =
    await Promise.all([
      tmdb.trending({ window: "week", media: "all" }),
      tmdb.popularMovies({}),
      tmdb.popularTv({}),
      tmdb.topRatedMovies({}),
      tmdb.nowPlayingMovies({}),
    ]);

  const lookup = await getGenreLookup("all");

  const trendingItems = await Promise.all(
    trending.results.slice(0, 12).map((r) => buildItem(r, "movie", lookup)),
  );
  const popularMovieItems = await Promise.all(
    popularMovies.results.slice(0, 12).map((r) => buildItem(r, "movie", lookup)),
  );
  const popularTvItems = await Promise.all(
    popularTv.results.slice(0, 12).map((r) => buildItem(r, "tv", lookup)),
  );
  const topRatedItems = await Promise.all(
    topRatedMovies.results.slice(0, 12).map((r) => buildItem(r, "movie", lookup)),
  );
  const nowPlayingItems = await Promise.all(
    nowPlaying.results.slice(0, 12).map((r) => buildItem(r, "movie", lookup)),
  );

  // Logo enrichment for every item, in parallel. Each call is cached 6h, so
  // subsequent /catalog/home loads only pay the cost once per restart.
  const [
    trendingWithLogos,
    popularMoviesWithLogos,
    popularTvWithLogos,
    topRatedWithLogos,
    nowPlayingWithLogos,
  ] = await Promise.all([
    Promise.all(trendingItems.map(enrichLogo)),
    Promise.all(popularMovieItems.map(enrichLogo)),
    Promise.all(popularTvItems.map(enrichLogo)),
    Promise.all(topRatedItems.map(enrichLogo)),
    Promise.all(nowPlayingItems.map(enrichLogo)),
  ]);

  const heroCandidate =
    trendingWithLogos.find((i) => i.backdropUrl) ??
    popularMoviesWithLogos.find((i) => i.backdropUrl) ??
    trendingWithLogos[0] ??
    popularMoviesWithLogos[0];

  if (!heroCandidate) {
    throw new Error("No hero candidate from TMDB");
  }
  // Hero already enriched (it came from one of the above arrays).
  const hero = heroCandidate;

  // Pull the hero's first official YouTube trailer key (cached at TTL.detail).
  let heroTrailerKey: string | null = null;
  try {
    const heroDetail =
      hero.kind === "movie"
        ? await tmdb.movieDetail(hero.id)
        : await tmdb.tvDetail(hero.id);
    const videos = heroDetail.videos?.results ?? [];
    const youTubeTrailers = videos.filter(
      (v) => v.site === "YouTube" && v.type === "Trailer",
    );
    const chosen =
      youTubeTrailers.find((v) => v.official) ?? youTubeTrailers[0];
    heroTrailerKey = chosen?.key ?? null;
  } catch {
    heroTrailerKey = null;
  }

  const rows: HomeRow[] = [
    { id: "trending", title: "This Week", accent: "Trending", kind: "wide", items: trendingWithLogos },
    { id: "popular-movies", title: "Movies", accent: "Popular", kind: "wide", items: popularMoviesWithLogos },
    { id: "popular-tv", title: "Series", accent: "Popular", kind: "wide", items: popularTvWithLogos },
    { id: "top-rated", title: "Of All Time", accent: "Top Rated", kind: "wide", items: topRatedWithLogos },
    { id: "now-playing", title: "In Theatres", accent: "Now Playing", kind: "wide", items: nowPlayingWithLogos },
  ];

  return { hero, heroTrailerKey, rows };
}

catalogRouter.get(
  "/home",
  asyncHandler(async (_req, res) => {
    const data = await cached("catalog:home", TTL.catalogHome, loadHome);
    res.set("Cache-Control", `public, max-age=${Math.floor(TTL.catalogHome / 1000)}`);
    res.json(data);
  }),
);

catalogRouter.get(
  "/title/:kind/:id",
  asyncHandler(async (req, res) => {
    const { kind } = req.params;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    if (kind === "movie") {
      const detail = await tmdb.movieDetail(id);
      const normalized = await toMovieDetail(detail);
      const enriched = await enrichLogo(normalized);
      res.set("Cache-Control", "public, max-age=0, must-revalidate");
      res.json(enriched);
      return;
    }
    if (kind === "tv") {
      const detail = await tmdb.tvDetail(id);
      const normalized = await toTvDetail(detail);
      const enriched = await enrichLogo(normalized);
      res.set("Cache-Control", "public, max-age=0, must-revalidate");
      res.json(enriched);
      return;
    }
    res.status(400).json({ error: "invalid_kind" });
  }),
);

catalogRouter.get(
  "/search",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.json({ items: [], page: 1, totalPages: 0 });
      return;
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const raw = await tmdb.search({ q, page });
    const filtered = {
      ...raw,
      results: raw.results.filter(
        (r) => r.media_type === "movie" || r.media_type === "tv",
      ),
    };
    const lookup = await getGenreLookup("all");
    const items = await Promise.all(
      filtered.results.map(async (r) => {
        const kind = r.media_type === "tv" ? "tv" : "movie";
        const tags = (r.genre_ids ?? [])
          .map((id) => lookup.get(id))
          .filter((n): n is string => Boolean(n));
        const [posterUrl, backdropUrl] = await Promise.all([
          imageUrl(r.poster_path, "poster"),
          imageUrl(r.backdrop_path, "backdrop"),
        ]);
        const date = r.release_date ?? r.first_air_date;
        const year =
          date && date.length >= 4 && Number.isFinite(Number(date.slice(0, 4)))
            ? Number(date.slice(0, 4))
            : null;
        return {
          id: r.id,
          kind,
          title: r.title ?? r.name ?? r.original_title ?? "Untitled",
          overview: r.overview ?? "",
          releaseYear: year,
          runtime: null,
          rating: "",
          match: Math.round(((r.vote_average ?? 0) as number) * 10),
          tags,
          posterUrl,
          backdropUrl,
          logoUrl: null,
        } satisfies MediaItem;
      }),
    );
    const enriched = await Promise.all(items.map(enrichLogo));
    res.set("Cache-Control", "public, max-age=0, must-revalidate");
    res.json({
      items: enriched,
      page: raw.page,
      totalPages: raw.total_pages,
    });
  }),
);

catalogRouter.get(
  "/title/tv/:id/season/:n",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const n = Number(req.params.n);
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(n) || n < 0) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    const raw = await tmdb.tvSeason(id, n);
    const normalized = await toTvSeasonDetail(raw);
    res.set("Cache-Control", "public, max-age=0, must-revalidate");
    res.json(normalized);
  }),
);
