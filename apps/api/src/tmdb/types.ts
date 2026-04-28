// Raw TMDB API shapes — only the fields we read.
export type TmdbList<T> = {
  page: number;
  total_pages: number;
  total_results: number;
  results: T[];
};

export type TmdbGenre = { id: number; name: string };

export type TmdbBaseMovie = {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genre_ids?: number[];
  media_type?: "movie" | "tv" | "person";
};

export type TmdbReleaseCertification = {
  iso_3166_1: string;
  release_dates: { certification: string; type: number }[];
};

export type TmdbContentRating = {
  iso_3166_1: string;
  rating: string;
};

export type TmdbCastEntry = {
  name: string;
  character: string;
  profile_path: string | null;
};

export type TmdbCrewEntry = {
  name: string;
  job: string;
};

export type TmdbVideo = {
  key: string;
  site: string;
  type: string;
  name: string;
  official: boolean;
  published_at?: string;
};

export type TmdbMovieDetail = TmdbBaseMovie & {
  runtime: number | null;
  genres: TmdbGenre[];
  spoken_languages: { english_name: string }[];
  release_dates?: { results: TmdbReleaseCertification[] };
  credits?: { cast: TmdbCastEntry[]; crew: TmdbCrewEntry[] };
  videos?: { results: TmdbVideo[] };
  similar?: TmdbList<TmdbBaseMovie>;
};

export type TmdbTvSeasonSummary = {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
  overview: string;
};

export type TmdbTvEpisode = {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  runtime: number | null;
  still_path: string | null;
  air_date: string | null;
};

export type TmdbTvSeasonDetail = {
  id: number;
  name: string;
  season_number: number;
  overview: string;
  air_date: string | null;
  episodes: TmdbTvEpisode[];
};

export type TmdbTvDetail = TmdbBaseMovie & {
  number_of_episodes: number | null;
  number_of_seasons: number | null;
  episode_run_time: number[];
  seasons?: TmdbTvSeasonSummary[];
  genres: TmdbGenre[];
  spoken_languages: { english_name: string }[];
  content_ratings?: { results: TmdbContentRating[] };
  credits?: { cast: TmdbCastEntry[]; crew: TmdbCrewEntry[] };
  videos?: { results: TmdbVideo[] };
  similar?: TmdbList<TmdbBaseMovie>;
};

export type TmdbImage = {
  file_path: string;
  iso_639_1: string | null;
  vote_average: number;
  vote_count: number;
  width: number;
  height: number;
  aspect_ratio: number;
};

export type TmdbImageBundle = {
  id: number;
  backdrops: TmdbImage[];
  logos: TmdbImage[];
  posters: TmdbImage[];
};

export type TmdbConfiguration = {
  images: {
    secure_base_url: string;
    poster_sizes: string[];
    backdrop_sizes: string[];
    still_sizes: string[];
    logo_sizes: string[];
    profile_sizes: string[];
  };
};
