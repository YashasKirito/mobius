// Raw Jackett result, before parsing/ranking into a shared StreamSource.
export type Candidate = {
  id: string;
  title: string;
  indexer: string;
  sizeBytes: number;
  seeders: number;
  leechers: number;
  magnet?: string;
  linkUrl?: string;
  trusted?: boolean; // came from an exact imdb-id search → skip the year guard
};

export type RankContext = {
  kind: "movie" | "tv";
  year: number | null;
  season?: number;
  episode?: number;
};
