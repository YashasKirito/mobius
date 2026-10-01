import type { MediaKind } from "./tmdb.js";

export type StreamServiceState = "ok" | "unreachable" | "unconfigured";

export type StreamStatus = {
  available: boolean;
  jackett: StreamServiceState;
  torrserver: StreamServiceState;
};

export type StreamSource = {
  id: string;
  title: string;
  indexer: string;
  sizeBytes: number;
  seeders: number;
  leechers: number;
  resolution: string; // "1080p", "720p", "2160p", "" if unknown
  source: string; // "WEB-DL", "BluRay", "HDTV", "" if unknown
  codec: string; // "x264", "x265", "" if unknown
  audio: string; // "aac", "dd", "ddp", "dts", "" if unknown
  browserAudio: boolean; // true if the audio codec plays natively in browsers
  isSeasonPack: boolean;
  magnet?: string;
  linkUrl?: string; // Jackett .torrent proxy link (fallback when no magnet)
  score: number;
};

export type StreamPlayRequest = {
  kind: MediaKind;
  id: number;
  s?: number;
  e?: number;
  sourceId?: string;
  // A full source to play directly. When present the server skips the Jackett
  // search + ranking entirely and loads this exact source into TorrServer —
  // this is how a remembered/hand-picked source replays instantly.
  source?: StreamSource;
};

export type StreamPlayResponse = {
  streamUrl: string;
  source: StreamSource;
  sources: StreamSource[];
};

export type SubtitleTrack = {
  id: string; // OpenSubtitles file_id, used to fetch the converted VTT
  language: string; // ISO 639-1, e.g. "en"
  label: string; // human name, e.g. "English"
};
