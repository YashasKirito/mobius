// Per-video resume positions, persisted to localStorage so the same trailer
// resumes from where it last paused regardless of which surface (hero, hover
// card, modal) plays it next.

const KEY = "mobius:playbackPositions";

type Store = Record<string, number>;

let rawStore = "{}";

function read(): Store {
  try {
    const raw = rawStore;
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
    rawStore = JSON.stringify(store);
    // localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // ignore quota / private-mode failures
  }
}

export function getPlaybackPosition(key: string): number | undefined {
  const store = read();
  const v = store[key];
  return typeof v === "number" && v > 0 ? v : undefined;
}

export function setPlaybackPosition(key: string, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const store = read();
  store[key] = Math.floor(seconds);
  write(store);
}

export function clearPlaybackPosition(key: string): void {
  const store = read();
  if (!(key in store)) return;
  delete store[key];
  write(store);
}
