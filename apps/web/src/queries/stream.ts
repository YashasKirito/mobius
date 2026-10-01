import { useQuery } from "@tanstack/react-query";
import type {
  MediaKind,
  StreamPlayRequest,
  StreamPlayResponse,
  StreamSource,
  StreamStatus,
  SubtitleTrack,
} from "@mobius/shared";

export type StreamError = Error & { status?: number; code?: string };

function decorateError(body: { error?: string }, status: number): StreamError {
  return Object.assign(new Error(body.error ?? `request failed: ${status}`), {
    status,
    code: body.error,
  });
}

async function fetchStatus(): Promise<StreamStatus> {
  const res = await fetch("/api/stream/status");
  if (!res.ok) throw new Error(`stream/status failed: ${res.status}`);
  return res.json() as Promise<StreamStatus>;
}

export async function fetchSources(params: {
  kind: MediaKind;
  id: number;
  s?: number;
  e?: number;
}): Promise<StreamSource[]> {
  const q = new URLSearchParams({ kind: params.kind, id: String(params.id) });
  if (params.s != null) q.set("s", String(params.s));
  if (params.e != null) q.set("e", String(params.e));
  const res = await fetch(`/api/stream/sources?${q.toString()}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw decorateError(body, res.status);
  }
  const data = (await res.json()) as { sources: StreamSource[] };
  return data.sources;
}

export async function playStream(
  req: StreamPlayRequest,
): Promise<StreamPlayResponse> {
  const res = await fetch("/api/stream/play", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw decorateError(body, res.status);
  }
  return res.json() as Promise<StreamPlayResponse>;
}

export async function fetchSubtitles(params: {
  kind: MediaKind;
  id: number;
  s?: number;
  e?: number;
}): Promise<SubtitleTrack[]> {
  const q = new URLSearchParams({ kind: params.kind, id: String(params.id) });
  if (params.s != null) q.set("s", String(params.s));
  if (params.e != null) q.set("e", String(params.e));
  try {
    const res = await fetch(`/api/stream/subtitles?${q.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { tracks: SubtitleTrack[] };
    return data.tracks;
  } catch {
    return []; // subtitles are non-critical — never block playback on them
  }
}

export const subtitleFileUrl = (fileId: string): string =>
  `/api/stream/subtitles/file/${fileId}`;

export const streamKeys = {
  status: ["stream", "status"] as const,
};

export function useStreamStatus() {
  return useQuery({
    queryKey: streamKeys.status,
    queryFn: fetchStatus,
    staleTime: 30_000,
    retry: false,
  });
}
