import type { MediaItem } from "./tmdb.js";

export type HomeRow = {
  id: string;
  title: string;
  accent: string;
  kind: "wide" | "poster";
  items: MediaItem[];
};

export type HomeCatalog = {
  hero: MediaItem;
  heroTrailerKey: string | null;
  rows: HomeRow[];
};
