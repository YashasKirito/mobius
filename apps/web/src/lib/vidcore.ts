// Embed URL builders for VidCore (https://vidcore.net).
// Movie: /movie/{tmdbId}    TV: /tv/{tmdbId}/{season}/{episode}
// Documented params we use: autoPlay, autoNext, nextButton, theme (hex w/o #).

const BASE = "https://vidcore.net";
const THEME = "c9a96a"; // champagne, matches the dark-morphism accent

export function vidcoreMovieUrl(tmdbId: number): string {
  const qs = new URLSearchParams({ autoPlay: "true", theme: THEME });
  return `${BASE}/movie/${tmdbId}?${qs.toString()}`;
}

export function vidcoreTvUrl(
  tmdbId: number,
  season: number,
  episode: number,
): string {
  const qs = new URLSearchParams({
    autoPlay: "true",
    autoNext: "true",
    nextButton: "true",
    theme: THEME,
  });
  return `${BASE}/tv/${tmdbId}/${season}/${episode}?${qs.toString()}`;
}
