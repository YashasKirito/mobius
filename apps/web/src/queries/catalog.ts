import { useQuery } from "@tanstack/react-query";
import type {
  HomeCatalog,
  MediaDetail,
  MediaItem,
  MediaKind,
  TvSeasonDetail,
} from "@mobius/shared";

export type SearchResults = {
  items: MediaItem[];
  page: number;
  totalPages: number;
};

async function fetchHome(): Promise<HomeCatalog> {
  const res = await fetch("/api/catalog/home");
  if (!res.ok) {
    throw new Error(`catalog/home failed: ${res.status}`);
  }
  return res.json() as Promise<HomeCatalog>;
}

async function fetchTitle(kind: MediaKind, id: number): Promise<MediaDetail> {
  const res = await fetch(`/api/catalog/title/${kind}/${id}`);
  if (!res.ok) {
    if (res.status === 404) {
      throw Object.assign(new Error("not_found"), { status: 404 });
    }
    throw new Error(`title fetch failed: ${res.status}`);
  }
  return res.json() as Promise<MediaDetail>;
}

async function fetchTvSeason(
  id: number,
  seasonNumber: number,
): Promise<TvSeasonDetail> {
  const res = await fetch(`/api/catalog/title/tv/${id}/season/${seasonNumber}`);
  if (!res.ok) throw new Error(`season fetch failed: ${res.status}`);
  return res.json() as Promise<TvSeasonDetail>;
}

async function fetchSearch(q: string): Promise<SearchResults> {
  const res = await fetch(`/api/catalog/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`search failed: ${res.status}`);
  return res.json() as Promise<SearchResults>;
}

export const catalogKeys = {
  home: ["catalog", "home"] as const,
  detail: (kind: MediaKind, id: number) => ["catalog", "title", kind, id] as const,
  season: (id: number, n: number) =>
    ["catalog", "title", "tv", id, "season", n] as const,
  search: (q: string) => ["catalog", "search", q] as const,
};

export function useHomeCatalog() {
  return useQuery({
    queryKey: catalogKeys.home,
    queryFn: fetchHome,
    staleTime: 10 * 60_000,
  });
}

export function useTitle(kind: MediaKind | undefined, id: number | undefined) {
  return useQuery({
    queryKey: kind && id != null ? catalogKeys.detail(kind, id) : ["catalog", "title", "none"],
    queryFn: () => {
      if (!kind || id == null) throw new Error("useTitle missing kind/id");
      return fetchTitle(kind, id);
    },
    enabled: !!kind && id != null,
  });
}

export function useSearch(query: string | undefined) {
  const q = query?.trim() ?? "";
  return useQuery({
    queryKey: catalogKeys.search(q),
    queryFn: () => fetchSearch(q),
    enabled: q.length > 0,
    staleTime: 60_000,
  });
}

export function useTvSeason(
  id: number | undefined,
  seasonNumber: number | undefined,
) {
  return useQuery({
    queryKey:
      id != null && seasonNumber != null
        ? catalogKeys.season(id, seasonNumber)
        : ["catalog", "title", "tv", "season", "none"],
    queryFn: () => {
      if (id == null || seasonNumber == null)
        throw new Error("useTvSeason missing id/season");
      return fetchTvSeason(id, seasonNumber);
    },
    enabled: id != null && seasonNumber != null,
    staleTime: 10 * 60_000,
  });
}
