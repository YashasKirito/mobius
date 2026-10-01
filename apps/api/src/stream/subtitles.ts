import type { SubtitleTrack } from "@mobius/shared";
import { logger } from "../lib/logger.js";
import { StreamError } from "./errors.js";
import type { StreamEnv } from "./env.js";

const OS_BASE = "https://api.opensubtitles.com/api/v1";

// Languages we ask OpenSubtitles for (kept to a useful shortlist so the menu
// stays readable). One track per language, top result by download count.
export const DEFAULT_SUB_LANGUAGES = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "ru",
  "ar",
  "hi",
  "ja",
  "ko",
  "zh",
];

const LANG_NAMES: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  "pt-br": "Portuguese (BR)",
  nl: "Dutch",
  ru: "Russian",
  ar: "Arabic",
  hi: "Hindi",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  "zh-cn": "Chinese",
  pl: "Polish",
  tr: "Turkish",
};

function langName(code: string): string {
  return LANG_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

// SubRip (.srt) → WebVTT. Browsers only render VTT via <track>, so we convert
// server-side: add the header and swap the comma decimal in cue timestamps.
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^﻿/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(
      /(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g,
      "$1.$2 --> $3.$4",
    );
  return `WEBVTT\n\n${body.trim()}\n`;
}

function osHeaders(env: StreamEnv, token?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Api-Key": env.opensubtitlesApiKey ?? "",
    "User-Agent": env.opensubtitlesAppName,
    Accept: "application/json",
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

// Login is optional — it raises the daily download quota. Token cached ~24h.
let tokenCache: { token: string; expires: number } | null = null;

async function getToken(env: StreamEnv): Promise<string | undefined> {
  if (!env.opensubtitlesUsername || !env.opensubtitlesPassword) return undefined;
  if (tokenCache && tokenCache.expires > Date.now()) return tokenCache.token;
  try {
    const res = await fetch(`${OS_BASE}/login`, {
      method: "POST",
      headers: { ...osHeaders(env), "Content-Type": "application/json" },
      body: JSON.stringify({
        username: env.opensubtitlesUsername,
        password: env.opensubtitlesPassword,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "opensubtitles login failed");
      return undefined;
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token) return undefined;
    tokenCache = { token: data.token, expires: Date.now() + 23 * 60 * 60 * 1000 };
    return data.token;
  } catch (err) {
    logger.warn({ err }, "opensubtitles login error");
    return undefined;
  }
}

type SearchParams = {
  kind: "movie" | "tv";
  imdbId: string | null;
  season?: number;
  episode?: number;
  languages: string[];
};

type OsSubtitle = {
  attributes?: {
    language?: string;
    download_count?: number;
    files?: { file_id?: number }[];
  };
};

export async function searchSubtitles(
  env: StreamEnv,
  params: SearchParams,
): Promise<SubtitleTrack[]> {
  if (!params.imdbId) return [];
  const imdb = params.imdbId.replace(/^tt/, "");
  const q = new URLSearchParams();
  q.set("languages", params.languages.join(","));
  q.set("order_by", "download_count");
  if (params.kind === "tv") {
    q.set("parent_imdb_id", imdb);
    if (params.season != null) q.set("season_number", String(params.season));
    if (params.episode != null) q.set("episode_number", String(params.episode));
  } else {
    q.set("imdb_id", imdb);
  }

  let res: Response;
  try {
    res = await fetch(`${OS_BASE}/subtitles?${q.toString()}`, {
      headers: osHeaders(env),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    logger.warn({ err }, "opensubtitles search error");
    return [];
  }
  if (!res.ok) {
    logger.warn({ status: res.status }, "opensubtitles search failed");
    return [];
  }
  const data = (await res.json()) as { data?: OsSubtitle[] };

  // Results are ordered by download_count; keep the first (best) per language.
  const byLang = new Map<string, SubtitleTrack>();
  for (const item of data.data ?? []) {
    const lang = (item.attributes?.language ?? "").toLowerCase();
    const fileId = item.attributes?.files?.[0]?.file_id;
    if (!lang || fileId == null || byLang.has(lang)) continue;
    byLang.set(lang, {
      id: String(fileId),
      language: lang,
      label: langName(lang),
    });
  }
  return [...byLang.values()];
}

export async function downloadVtt(
  env: StreamEnv,
  fileId: string,
): Promise<string> {
  const token = await getToken(env);
  const res = await fetch(`${OS_BASE}/download`, {
    method: "POST",
    headers: { ...osHeaders(env, token), "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: Number(fileId) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logger.warn({ status: res.status, detail }, "opensubtitles download failed");
    throw new StreamError(502, "search_failed", "subtitle download failed");
  }
  const data = (await res.json()) as { link?: string };
  if (!data.link) {
    throw new StreamError(502, "search_failed", "no subtitle link returned");
  }
  const sub = await fetch(data.link, { signal: AbortSignal.timeout(15_000) });
  if (!sub.ok) {
    throw new StreamError(502, "search_failed", "subtitle fetch failed");
  }
  return srtToVtt(await sub.text());
}
