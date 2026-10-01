import { parse, type DefaultParserResult } from "parse-torrent-title";
import type { StreamSource } from "@mobius/shared";
import type { Candidate, RankContext } from "./types.js";

const GB = 1024 * 1024 * 1024;

// Sources we never want to stream (checked against the raw release title).
const BANNED_SOURCE =
  /\b(cam|camrip|ts|telesync|tc|telecine|hdcam|hdts|screener|scr)\b/i;

type Parsed = DefaultParserResult;

// parse-torrent-title lowercases source values (e.g. "web-dl", "bluray") and
// sometimes puts the real broadcast source in `sourcelist` (e.g. HDTV shows up
// there when a codec like XviD wins the primary `source` slot).
function sourceTokens(p: Parsed): string {
  const list = Array.isArray(p.sourcelist) ? p.sourcelist.join(" ") : "";
  return `${p.source ?? ""} ${list}`.toLowerCase();
}

function isSeasonPack(p: Parsed, title: string): boolean {
  // A pack has a season but no single episode, or the title says so.
  if (p.episode != null) return false;
  if (p.season != null) return true;
  return /\bcomplete\b|\bseason\b/i.test(title);
}

function resolutionScore(res: string): number {
  switch (res) {
    case "1080p":
      return 100;
    case "720p":
      return 70;
    case "2160p":
      return 55;
    case "480p":
      return 30;
    default:
      return 30;
  }
}

// Swarm health is decisive: a torrent with too few seeders may never fetch
// metadata (TorrServer stalls) and buffers badly even if it does — so it must
// lose to a healthy swarm regardless of quality/audio edge. Rewards scale up to
// +60 for large swarms; tiny swarms are actively penalized.
function seedScore(seeders: number): number {
  if (seeders < 4) return -50;
  if (seeders < 10) return -10;
  return Math.min(60, 20 * Math.log10(seeders));
}

function sourceScore(p: Parsed): number {
  const s = sourceTokens(p);
  if (s.includes("web-dl") || s.includes("webdl") || s.includes("bluray")) {
    return 25;
  }
  if (s.includes("webrip") || s.includes("web")) return 15;
  if (s.includes("hdtv")) return 5;
  return 0;
}

function codecScore(codec: string): number {
  const c = codec.toLowerCase();
  if (c.includes("264") || c.includes("avc")) return 15;
  if (c.includes("265") || c.includes("hevc") || c.includes("av1")) return -10;
  return 0;
}

// Audio codecs an HTML5 <video> can decode natively. AC3 (dd), E-AC3 (ddp),
// DTS, TrueHD and Atmos are common in "quality" releases but produce silent
// playback in browsers — so we prefer AAC and penalize the rest.
const BROWSER_AUDIO = new Set(["aac", "opus", "mp3", "vorbis", "flac"]);
const UNPLAYABLE_AUDIO = new Set([
  "dd",
  "ddp",
  "dts",
  "truehd",
  "atmos",
  "dtshd",
]);

export function isBrowserAudio(audio: string): boolean {
  return BROWSER_AUDIO.has(audio.toLowerCase());
}

function audioScore(audio: string): number {
  const a = audio.toLowerCase();
  if (BROWSER_AUDIO.has(a)) return 20;
  if (UNPLAYABLE_AUDIO.has(a)) return -25;
  return 0; // unknown — could be anything; stay neutral
}

function sizeScore(
  sizeBytes: number,
  kind: "movie" | "tv",
  pack: boolean,
): number {
  const gb = sizeBytes / GB;
  if (kind === "movie") {
    if (gb >= 2 && gb <= 6) return 10;
    return Math.max(-15, 10 - Math.abs(gb - 4) * 3);
  }
  if (pack) return 0;
  if (gb >= 0.5 && gb <= 2.5) return 10;
  return Math.max(-15, 10 - Math.abs(gb - 1.5) * 6);
}

function passesFilters(
  c: Candidate,
  p: Parsed,
  pack: boolean,
  ctx: RankContext,
): boolean {
  if (c.seeders < 1) return false;
  if (BANNED_SOURCE.test(c.title)) return false;

  const gb = c.sizeBytes / GB;
  if (ctx.kind === "movie") {
    if (gb < 0.7 || gb > 12) return false;
    // Text-search results (untrusted) must match the release year; results from
    // an exact imdb-id search are trusted and skip this guard.
    if (!c.trusted && ctx.year != null && p.year != null) {
      if (Math.abs(p.year - ctx.year) > 1) return false;
    }
  } else {
    // TV
    if (pack) {
      if (gb > 80) return false;
      if (ctx.season != null && p.season != null && p.season !== ctx.season) {
        return false;
      }
    } else {
      if (gb < 0.1 || gb > 4) return false;
      if (ctx.season != null && p.season !== ctx.season) return false;
      if (ctx.episode != null && p.episode !== ctx.episode) return false;
    }
  }
  return true;
}

export function rankSources(
  candidates: Candidate[],
  ctx: RankContext,
): StreamSource[] {
  const scored: StreamSource[] = [];
  for (const c of candidates) {
    const p = parse(c.title);
    const pack = ctx.kind === "tv" && isSeasonPack(p, c.title);
    if (!passesFilters(c, p, pack, ctx)) continue;

    const resolution = p.resolution ?? "";
    const source = p.source ?? "";
    const codec = p.codec ?? "";
    const audio = p.audio ?? "";

    const score =
      resolutionScore(resolution) +
      seedScore(c.seeders) +
      sourceScore(p) +
      codecScore(codec) +
      audioScore(audio) +
      sizeScore(c.sizeBytes, ctx.kind, pack) +
      (pack ? -5 : 0);

    scored.push({
      id: c.id,
      title: c.title,
      indexer: c.indexer,
      sizeBytes: c.sizeBytes,
      seeders: c.seeders,
      leechers: c.leechers,
      resolution,
      source,
      codec,
      audio,
      browserAudio: isBrowserAudio(audio),
      isSeasonPack: pack,
      magnet: c.magnet,
      linkUrl: c.linkUrl,
      score: Math.round(score * 10) / 10,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}
