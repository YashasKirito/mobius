import { parse } from "parse-torrent-title";

export type TorrentFile = {
  index: number;
  path: string;
  length: number;
};

const VIDEO_EXT = /\.(mp4|mkv|avi|m4v|webm|mov|ts)$/i;
const SAMPLE = /\bsample\b/i;

function isVideo(f: TorrentFile): boolean {
  return VIDEO_EXT.test(f.path) && !SAMPLE.test(f.path);
}

function largest(files: TorrentFile[]): TorrentFile | null {
  let best: TorrentFile | null = null;
  for (const f of files) {
    if (!isVideo(f)) continue;
    if (!best || f.length > best.length) best = f;
  }
  return best;
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

export function pickVideoFile(
  files: TorrentFile[],
  want?: { season: number; episode: number },
): TorrentFile | null {
  if (!want) return largest(files);

  for (const f of files) {
    if (!isVideo(f)) continue;
    const parsed = parse(baseName(f.path));
    if (parsed.season === want.season && parsed.episode === want.episode) {
      return f;
    }
  }
  return largest(files);
}
