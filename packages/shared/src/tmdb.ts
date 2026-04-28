export type MediaKind = "movie" | "tv";

export type MediaItem = {
  id: number;
  kind: MediaKind;
  title: string;
  overview: string;
  releaseYear: number | null;
  runtime: string | null; // "1h 42m" or "6 EP"
  rating: string; // "TV-MA", "PG-13", or "" if unknown
  match: number; // round(vote_average * 10), 0–100
  tags: string[]; // genre names
  posterUrl: string | null;
  backdropUrl: string | null;
  logoUrl: string | null;
  live?: boolean;
  progress?: number;
};

export type MediaList = {
  items: MediaItem[];
  page: number;
  totalPages: number;
};

export type CastMember = {
  name: string;
  character: string;
  profileUrl: string | null;
};

export type Trailer = {
  key: string;
  site: string;
  name: string;
};

export type TvSeasonSummary = {
  number: number;
  name: string;
  episodeCount: number;
  airYear: number | null;
};

export type TvEpisode = {
  number: number;
  name: string;
  overview: string;
  runtime: string | null;
  stillUrl: string | null;
  airDate: string | null;
};

export type TvSeasonDetail = {
  seasonNumber: number;
  name: string;
  episodes: TvEpisode[];
};

export type MediaDetail = MediaItem & {
  cast: CastMember[];
  directors: string[];
  languages: string[];
  similar: MediaItem[];
  trailers: Trailer[];
  seasons?: TvSeasonSummary[];
};
