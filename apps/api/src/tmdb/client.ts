import { cached, TTL } from "../lib/cache.js";
import { tmdbFetch } from "../lib/http.js";
import type {
  TmdbBaseMovie,
  TmdbGenre,
  TmdbImageBundle,
  TmdbList,
  TmdbMovieDetail,
  TmdbTvDetail,
  TmdbTvSeasonDetail,
} from "./types.js";

export type TrendingWindow = "day" | "week";
export type TrendingMedia = "all" | "movie" | "tv";

export const tmdb = {
  trending: ({ window = "week", media = "all" }: { window?: TrendingWindow; media?: TrendingMedia } = {}) =>
    cached(`trending:${media}:${window}`, TTL.list, () =>
      tmdbFetch<TmdbList<TmdbBaseMovie>>(`/trending/${media}/${window}`),
    ),

  popularMovies: ({ page = 1 } = {}) =>
    cached(`popular:movies:${page}`, TTL.list, () =>
      tmdbFetch<TmdbList<TmdbBaseMovie>>("/movie/popular", { page }),
    ),

  popularTv: ({ page = 1 } = {}) =>
    cached(`popular:tv:${page}`, TTL.list, () =>
      tmdbFetch<TmdbList<TmdbBaseMovie>>("/tv/popular", { page }),
    ),

  topRatedMovies: ({ page = 1 } = {}) =>
    cached(`top-rated:movies:${page}`, TTL.list, () =>
      tmdbFetch<TmdbList<TmdbBaseMovie>>("/movie/top_rated", { page }),
    ),

  topRatedTv: ({ page = 1 } = {}) =>
    cached(`top-rated:tv:${page}`, TTL.list, () =>
      tmdbFetch<TmdbList<TmdbBaseMovie>>("/tv/top_rated", { page }),
    ),

  upcomingMovies: ({ page = 1 } = {}) =>
    cached(`upcoming:movies:${page}`, TTL.list, () =>
      tmdbFetch<TmdbList<TmdbBaseMovie>>("/movie/upcoming", { page }),
    ),

  nowPlayingMovies: ({ page = 1 } = {}) =>
    cached(`now-playing:movies:${page}`, TTL.list, () =>
      tmdbFetch<TmdbList<TmdbBaseMovie>>("/movie/now_playing", { page }),
    ),

  airingTodayTv: ({ page = 1 } = {}) =>
    cached(`airing-today:tv:${page}`, TTL.list, () =>
      tmdbFetch<TmdbList<TmdbBaseMovie>>("/tv/airing_today", { page }),
    ),

  movieDetail: (id: number) =>
    cached(`movie:${id}`, TTL.detail, () =>
      tmdbFetch<TmdbMovieDetail>(`/movie/${id}`, {
        append_to_response: "credits,videos,similar,release_dates",
      }),
    ),

  tvDetail: (id: number) =>
    cached(`tv:${id}`, TTL.detail, () =>
      tmdbFetch<TmdbTvDetail>(`/tv/${id}`, {
        append_to_response: "credits,videos,similar,content_ratings",
      }),
    ),

  tvSeason: (id: number, seasonNumber: number) =>
    cached(`tv:${id}:season:${seasonNumber}`, TTL.detail, () =>
      tmdbFetch<TmdbTvSeasonDetail>(`/tv/${id}/season/${seasonNumber}`),
    ),

  search: ({ q, page = 1 }: { q: string; page?: number }) =>
    cached(`search:${q}:${page}`, TTL.search, () =>
      tmdbFetch<TmdbList<TmdbBaseMovie>>("/search/multi", { query: q, page, include_adult: false }),
    ),

  images: ({ kind, id }: { kind: "movie" | "tv"; id: number }) =>
    cached(`images:${kind}:${id}`, TTL.detail, () =>
      tmdbFetch<TmdbImageBundle>(`/${kind}/${id}/images`, {
        include_image_language: "en,null",
      }),
    ),

  movieGenres: () =>
    cached("genres:movies", TTL.genres, () =>
      tmdbFetch<{ genres: TmdbGenre[] }>("/genre/movie/list"),
    ),

  tvGenres: () =>
    cached("genres:tv", TTL.genres, () =>
      tmdbFetch<{ genres: TmdbGenre[] }>("/genre/tv/list"),
    ),
};
