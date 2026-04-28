import type {
  MediaDetail,
  MediaItem,
  MediaKind,
  MediaList,
  TvSeasonDetail,
  TvSeasonSummary,
} from "@mobius/shared";
import { imageUrl } from "./images.js";
import { tmdb } from "./client.js";
import type {
  TmdbBaseMovie,
  TmdbContentRating,
  TmdbGenre,
  TmdbImage,
  TmdbList,
  TmdbMovieDetail,
  TmdbReleaseCertification,
  TmdbTvDetail,
  TmdbTvSeasonDetail,
} from "./types.js";

export function pickLogoPath(logos: TmdbImage[] | undefined): string | null {
  if (!logos || logos.length === 0) return null;
  const english = logos
    .filter((l) => l.iso_639_1 === "en")
    .sort((a, b) => b.vote_count - a.vote_count);
  if (english[0]) return english[0].file_path;
  const universal = logos.filter((l) => l.iso_639_1 === null);
  if (universal[0]) return universal[0].file_path;
  return logos[0]?.file_path ?? null;
}

function pickKind(raw: TmdbBaseMovie, fallback: MediaKind): MediaKind {
  if (raw.media_type === "movie" || raw.media_type === "tv") return raw.media_type;
  return fallback;
}

function pickTitle(raw: TmdbBaseMovie): string {
  return raw.title ?? raw.name ?? raw.original_title ?? "Untitled";
}

function pickYear(raw: TmdbBaseMovie): number | null {
  const date = raw.release_date ?? raw.first_air_date;
  if (!date || date.length < 4) return null;
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function formatRuntime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  if (m <= 0) return `${h}h`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

function pickMovieRating(detail: TmdbMovieDetail): string {
  const buckets: TmdbReleaseCertification[] = detail.release_dates?.results ?? [];
  const us = buckets.find((b) => b.iso_3166_1 === "US");
  const fromUs = us?.release_dates.find((r) => r.certification.length > 0)?.certification;
  if (fromUs) return fromUs;
  for (const b of buckets) {
    const cert = b.release_dates.find((r) => r.certification.length > 0)?.certification;
    if (cert) return cert;
  }
  return "";
}

function pickTvRating(detail: TmdbTvDetail): string {
  const ratings: TmdbContentRating[] = detail.content_ratings?.results ?? [];
  const us = ratings.find((r) => r.iso_3166_1 === "US");
  if (us?.rating) return us.rating;
  return ratings.find((r) => r.rating)?.rating ?? "";
}

async function buildBase(
  raw: TmdbBaseMovie,
  kind: MediaKind,
  genreLookup: Map<number, string>,
  detailGenres?: TmdbGenre[],
): Promise<MediaItem> {
  const tags = detailGenres
    ? detailGenres.map((g) => g.name)
    : (raw.genre_ids ?? [])
        .map((id) => genreLookup.get(id))
        .filter((n): n is string => Boolean(n));

  const [posterUrl, backdropUrl] = await Promise.all([
    imageUrl(raw.poster_path, "poster"),
    imageUrl(raw.backdrop_path, "backdrop"),
  ]);

  return {
    id: raw.id,
    kind,
    title: pickTitle(raw),
    overview: raw.overview ?? "",
    releaseYear: pickYear(raw),
    runtime: null,
    rating: "",
    match: Math.round(((raw.vote_average ?? 0) as number) * 10),
    tags,
    posterUrl,
    backdropUrl,
    logoUrl: null,
  };
}

async function getGenreLookup(kind: MediaKind | "all"): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const calls: Array<Promise<{ genres: TmdbGenre[] }>> = [];
  if (kind === "movie" || kind === "all") calls.push(tmdb.movieGenres());
  if (kind === "tv" || kind === "all") calls.push(tmdb.tvGenres());
  const results = await Promise.all(calls);
  for (const r of results) for (const g of r.genres) map.set(g.id, g.name);
  return map;
}

export async function toMediaItem(
  raw: TmdbBaseMovie,
  kind: MediaKind,
  genreLookup?: Map<number, string>,
): Promise<MediaItem> {
  const lookup = genreLookup ?? (await getGenreLookup(kind));
  return buildBase(raw, pickKind(raw, kind), lookup);
}

export async function toMediaList(
  raw: TmdbList<TmdbBaseMovie>,
  kind: MediaKind | "all",
): Promise<MediaList> {
  const lookup = await getGenreLookup(kind);
  const items = await Promise.all(
    raw.results.map((r) =>
      buildBase(r, kind === "all" ? pickKind(r, "movie") : kind, lookup),
    ),
  );
  return {
    items,
    page: raw.page,
    totalPages: raw.total_pages,
  };
}

export async function toMovieDetail(detail: TmdbMovieDetail): Promise<MediaDetail> {
  const lookup = await getGenreLookup("movie");
  const base = await buildBase(detail, "movie", lookup, detail.genres);
  base.runtime = formatRuntime(detail.runtime);
  base.rating = pickMovieRating(detail);

  const cast = await Promise.all(
    (detail.credits?.cast ?? []).slice(0, 12).map(async (c) => ({
      name: c.name,
      character: c.character,
      profileUrl: await imageUrl(c.profile_path, "profile"),
    })),
  );
  const directors = (detail.credits?.crew ?? [])
    .filter((c) => c.job === "Director")
    .map((c) => c.name);
  const trailers = (detail.videos?.results ?? [])
    .filter((v) => v.site === "YouTube" && v.type === "Trailer")
    .slice(0, 5)
    .map((v) => ({ key: v.key, site: v.site, name: v.name }));
  const similar = await Promise.all(
    (detail.similar?.results ?? []).slice(0, 12).map((r) => buildBase(r, "movie", lookup)),
  );
  const languages = (detail.spoken_languages ?? []).map((l) => l.english_name);

  return { ...base, cast, directors, languages, similar, trailers };
}

export async function toTvDetail(detail: TmdbTvDetail): Promise<MediaDetail> {
  const lookup = await getGenreLookup("tv");
  const base = await buildBase(detail, "tv", lookup, detail.genres);
  const ep = detail.number_of_episodes ?? 0;
  base.runtime = ep > 0 ? `${ep} EP` : formatRuntime(detail.episode_run_time?.[0]);
  base.rating = pickTvRating(detail);

  const cast = await Promise.all(
    (detail.credits?.cast ?? []).slice(0, 12).map(async (c) => ({
      name: c.name,
      character: c.character,
      profileUrl: await imageUrl(c.profile_path, "profile"),
    })),
  );
  const directors = (detail.credits?.crew ?? [])
    .filter((c) => c.job === "Director" || c.job === "Series Director" || c.job === "Creator")
    .map((c) => c.name);
  const trailers = (detail.videos?.results ?? [])
    .filter((v) => v.site === "YouTube" && v.type === "Trailer")
    .slice(0, 5)
    .map((v) => ({ key: v.key, site: v.site, name: v.name }));
  const similar = await Promise.all(
    (detail.similar?.results ?? []).slice(0, 12).map((r) => buildBase(r, "tv", lookup)),
  );
  const languages = (detail.spoken_languages ?? []).map((l) => l.english_name);
  const seasons: TvSeasonSummary[] = (detail.seasons ?? [])
    .filter((s) => s.season_number >= 1 && s.episode_count > 0)
    .map((s) => ({
      number: s.season_number,
      name: s.name,
      episodeCount: s.episode_count,
      airYear:
        s.air_date && s.air_date.length >= 4
          ? Number(s.air_date.slice(0, 4)) || null
          : null,
    }));

  return { ...base, cast, directors, languages, similar, trailers, seasons };
}

export async function toTvSeasonDetail(
  detail: TmdbTvSeasonDetail,
): Promise<TvSeasonDetail> {
  const episodes = await Promise.all(
    detail.episodes.map(async (e) => ({
      number: e.episode_number,
      name: e.name,
      overview: e.overview ?? "",
      runtime: formatRuntime(e.runtime),
      stillUrl: await imageUrl(e.still_path, "still"),
      airDate: e.air_date,
    })),
  );
  return {
    seasonNumber: detail.season_number,
    name: detail.name,
    episodes,
  };
}

export { getGenreLookup };
