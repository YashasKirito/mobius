// Remembers which torrent source the user last streamed for a given title, so
// returning to a movie/episode replays that exact source instead of re-running
// the Jackett search + ranking. Persisted to localStorage (survives reloads).

import type { MediaKind, StreamSource } from "@mobius/shared";

const KEY = "mobius:sourceSelections";

type Store = Record<string, StreamSource>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as Store;
    return {};
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // ignore quota / private-mode failures
  }
}

export function sourceKey(
  kind: MediaKind,
  id: number,
  s?: number,
  e?: number,
): string {
  return kind === "tv" ? `tv:${id}:${s ?? 1}:${e ?? 1}` : `movie:${id}`;
}

export function getSelectedSource(key: string): StreamSource | undefined {
  return read()[key];
}

export function setSelectedSource(key: string, source: StreamSource): void {
  const store = read();
  store[key] = source;
  write(store);
}

export function clearSelectedSource(key: string): void {
  const store = read();
  if (!(key in store)) return;
  delete store[key];
  write(store);
}
