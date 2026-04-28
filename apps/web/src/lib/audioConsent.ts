const KEY = "mobius:audioConsent";

export const hasPersistedAudioConsent = (): boolean => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

let pageInteracted = false;
export const hasInteractedThisPageLoad = (): boolean => pageInteracted;

const listeners = new Set<() => void>();

export function onUserInteraction(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

let started = false;
export function startInteractionTracker(): void {
  if (started || typeof document === "undefined") return;
  started = true;
  const onAny = () => {
    pageInteracted = true;
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // ignore quota / private-mode failures
    }
    for (const fn of listeners) fn();
  };
  const opts: AddEventListenerOptions = { capture: true, passive: true };
  document.addEventListener("click", onAny, opts);
  document.addEventListener("keydown", onAny, opts);
  document.addEventListener("touchstart", onAny, opts);
}
