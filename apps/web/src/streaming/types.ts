export type {
  CastMember,
  MediaDetail,
  MediaItem,
  MediaKind,
  MediaList,
  Trailer,
  TvEpisode,
  TvSeasonDetail,
  TvSeasonSummary,
} from "@mobius/shared";

export const FALLBACK_BACKDROP = "/assets/media/midnight-rain-wide.svg";
export const FALLBACK_POSTER = "/assets/media/midnight-rain-poster.svg";

export const itemKey = (item: { kind: string; id: number }) =>
  `${item.kind}-${item.id}`;

export const buildMeta = (item: {
  releaseYear: number | null;
  runtime: string | null;
  rating: string;
  match: number;
}): string => {
  const parts: Array<string | number> = [];
  if (item.releaseYear) parts.push(item.releaseYear);
  if (item.runtime) parts.push(item.runtime);
  if (item.rating) parts.push(item.rating);
  if (item.match > 0) parts.push(`${item.match}% match`);
  return parts.join(" · ");
};
