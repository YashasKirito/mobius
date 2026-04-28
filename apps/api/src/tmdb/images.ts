import { cached, TTL } from "../lib/cache.js";
import { tmdbFetch } from "../lib/http.js";

type Configuration = {
  images: {
    secure_base_url: string;
    poster_sizes: string[];
    backdrop_sizes: string[];
    still_sizes: string[];
    logo_sizes: string[];
    profile_sizes: string[];
  };
};

export type ImageKind = "poster" | "backdrop" | "still" | "logo" | "profile";

const DEFAULT_SIZE: Record<ImageKind, string> = {
  poster: "w500",
  backdrop: "w1280",
  still: "w300",
  logo: "w300",
  profile: "w185",
};

let configPromise: Promise<Configuration> | null = null;

function loadConfiguration(): Promise<Configuration> {
  if (!configPromise) {
    configPromise = cached("tmdb:configuration", TTL.configuration, () =>
      tmdbFetch<Configuration>("/configuration"),
    ).catch((err) => {
      configPromise = null;
      throw err;
    });
  }
  return configPromise;
}

export async function imageUrl(
  path: string | null | undefined,
  kind: ImageKind,
  size?: string,
): Promise<string | null> {
  if (!path) return null;
  const cfg = await loadConfiguration();
  const wanted = size ?? DEFAULT_SIZE[kind];
  const sizes =
    kind === "poster"
      ? cfg.images.poster_sizes
      : kind === "backdrop"
        ? cfg.images.backdrop_sizes
        : kind === "still"
          ? cfg.images.still_sizes
          : kind === "logo"
            ? cfg.images.logo_sizes
            : cfg.images.profile_sizes;
  const chosen = sizes.includes(wanted) ? wanted : (sizes.find((s) => s !== "original") ?? "original");
  return `${cfg.images.secure_base_url}${chosen}${path}`;
}
