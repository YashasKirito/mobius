import { useQuery } from "@tanstack/react-query";
import type { MediaList } from "@mobius/shared";

const FALLBACK_BACKDROPS = [
  "/assets/media/midnight-rain-wide.svg",
  "/assets/media/echoes-wide.svg",
  "/assets/media/voidwalker-wide.svg",
  "/assets/media/neon-drift-wide.svg",
  "/assets/media/arclight-wide.svg",
  "/assets/media/pale-horse-wide.svg",
  "/assets/media/solar-flare-wide.svg",
  "/assets/media/crimson-tide-wide.svg",
];

const TARGET = 20;

async function fetchTrendingBackdrops(): Promise<string[]> {
  const res = await fetch("/api/tmdb/trending?window=week");
  if (!res.ok) {
    throw new Error(`trending failed: ${res.status}`);
  }
  const body = (await res.json()) as MediaList;
  return body.items
    .map((item) => item.backdropUrl)
    .filter((url): url is string => typeof url === "string");
}

export function useLoginBackdrops(): string[] {
  const { data } = useQuery({
    queryKey: ["login", "trending-backdrops"],
    queryFn: fetchTrendingBackdrops,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });
  const real = data ?? [];
  if (real.length >= 4) return real.slice(0, TARGET);
  return FALLBACK_BACKDROPS;
}
