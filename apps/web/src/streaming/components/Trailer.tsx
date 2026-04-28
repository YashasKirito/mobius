import { useEffect, useRef } from "react";
import { loadYouTubeApi } from "../../lib/youtubePlayer";
import {
  hasPersistedAudioConsent,
  onUserInteraction,
} from "../../lib/audioConsent";
import {
  clearPlaybackPosition,
  getPlaybackPosition,
  setPlaybackPosition,
} from "../../lib/playbackPositions";

type Props = {
  trailerKey: string;
  paused: boolean;
  startDelayMs?: number;
  loopDelayMs?: number;
  className?: string;
  onPlaybackChange?: (playing: boolean) => void;
};

const DEFAULT_START_DELAY_MS = 3000;
const DEFAULT_LOOP_DELAY_MS = 5000;
const HARD_FAIL_MS = 10000;
const POSITION_SAVE_INTERVAL_MS = 2000;
// Treat the trailer as "completed" if we resumed within this many seconds of
// the end — start fresh next time instead of replaying the closing frame.
const RESUME_END_THRESHOLD_S = 3;

export function Trailer({
  trailerKey,
  paused,
  startDelayMs = DEFAULT_START_DELAY_MS,
  loopDelayMs = DEFAULT_LOOP_DELAY_MS,
  className = "dm-trailer",
  onPlaybackChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const wantsToPlayRef = useRef(false);
  const failedRef = useRef(false);
  const firstPlayRef = useRef(true);
  const startTimerRef = useRef<number | null>(null);
  const loopTimerRef = useRef<number | null>(null);
  const hardFailTimerRef = useRef<number | null>(null);
  const saveIntervalRef = useRef<number | null>(null);
  const inViewRef = useRef(true);
  const visibleRef = useRef(
    typeof document === "undefined" ? true : !document.hidden,
  );
  const pausedRef = useRef(paused);
  const onPlaybackChangeRef = useRef(onPlaybackChange);

  pausedRef.current = paused;
  onPlaybackChangeRef.current = onPlaybackChange;

  const clearTimer = (ref: React.MutableRefObject<number | null>) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const apply = () => {
    const p = playerRef.current;
    if (!p || failedRef.current) return;
    const shouldPlay =
      wantsToPlayRef.current &&
      !pausedRef.current &&
      inViewRef.current &&
      visibleRef.current;
    try {
      if (shouldPlay) p.playVideo();
      else p.pauseVideo();
    } catch {
      // Player may not be ready yet — ignore.
    }
  };

  const tryUnmute = () => {
    const p = playerRef.current;
    if (!p) return;
    if (!hasPersistedAudioConsent()) return;
    try {
      if (p.isMuted()) {
        p.unMute();
        p.setVolume(100);
      }
    } catch {
      // ignore
    }
  };

  const savePosition = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const t = p.getCurrentTime();
      const d = p.getDuration();
      if (!Number.isFinite(t)) return;
      // Treat near-end as completion so the next play starts from the top.
      if (Number.isFinite(d) && d > 0 && t >= d - RESUME_END_THRESHOLD_S) {
        clearPlaybackPosition(trailerKey);
        return;
      }
      setPlaybackPosition(trailerKey, t);
    } catch {
      // ignore
    }
  };

  const stopSaveInterval = () => {
    if (saveIntervalRef.current !== null) {
      window.clearInterval(saveIntervalRef.current);
      saveIntervalRef.current = null;
    }
  };

  const startSaveInterval = () => {
    if (saveIntervalRef.current !== null) return;
    saveIntervalRef.current = window.setInterval(
      savePosition,
      POSITION_SAVE_INTERVAL_MS,
    );
  };

  useEffect(() => {
    let cancelled = false;
    const host = containerRef.current;
    if (!host) return;

    wantsToPlayRef.current = false;
    failedRef.current = false;
    firstPlayRef.current = true;

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          inViewRef.current = entry.intersectionRatio >= 0.25;
          apply();
        },
        { threshold: [0, 0.25, 0.5, 1] },
      );
      observer.observe(host);
    }

    const onVisibility = () => {
      visibleRef.current = !document.hidden;
      apply();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Any user gesture refreshes browser activation; retry unmute so the hero
    // (created without recent activation) picks up sound on the next click.
    const unsubInteract = onUserInteraction(() => tryUnmute());

    // Defer player creation until after the start delay. This avoids the
    // YouTube "play" overlay flicker that appears between CUED and PLAYING
    // when we'd otherwise call playVideo() programmatically.
    startTimerRef.current = window.setTimeout(() => {
      startTimerRef.current = null;
      if (cancelled) return;
      void loadYouTubeApi().then((YT) => {
        if (cancelled) return;
        const inner = document.createElement("div");
        host.appendChild(inner);
        const resumeAt = getPlaybackPosition(trailerKey);
        const player = new YT.Player(inner, {
          videoId: trailerKey,
          host: "https://www.youtube-nocookie.com",
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            // Always start muted so autoplay reliably succeeds; we unmute
            // after PLAYING begins if we have persisted consent + an in-page
            // gesture this load.
            mute: 1,
            cc_load_policy: 0,
            origin: window.location.origin,
            ...(resumeAt ? { start: resumeAt } : {}),
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              playerRef.current = player;
              wantsToPlayRef.current = true;
              apply();
              hardFailTimerRef.current = window.setTimeout(() => {
                hardFailTimerRef.current = null;
                const p = playerRef.current;
                if (!p) return;
                try {
                  if (p.getPlayerState() !== YT.PlayerState.PLAYING) {
                    failedRef.current = true;
                    wantsToPlayRef.current = false;
                    onPlaybackChangeRef.current?.(false);
                  }
                } catch {
                  // ignore
                }
              }, HARD_FAIL_MS);
            },
            onStateChange: (e) => {
              if (cancelled) return;
              if (e.data === YT.PlayerState.PLAYING) {
                clearTimer(hardFailTimerRef);
                if (firstPlayRef.current) {
                  firstPlayRef.current = false;
                  tryUnmute();
                }
                startSaveInterval();
                onPlaybackChangeRef.current?.(true);
              } else if (e.data === YT.PlayerState.ENDED) {
                stopSaveInterval();
                clearPlaybackPosition(trailerKey);
                wantsToPlayRef.current = false;
                onPlaybackChangeRef.current?.(false);
                clearTimer(loopTimerRef);
                loopTimerRef.current = window.setTimeout(() => {
                  loopTimerRef.current = null;
                  wantsToPlayRef.current = true;
                  const p = playerRef.current;
                  if (!p) return;
                  try {
                    p.seekTo(0, true);
                    apply();
                  } catch {
                    // ignore
                  }
                }, loopDelayMs);
              } else if (e.data === YT.PlayerState.PAUSED) {
                stopSaveInterval();
                savePosition();
                onPlaybackChangeRef.current?.(false);
              }
            },
            onError: () => {
              failedRef.current = true;
              wantsToPlayRef.current = false;
              onPlaybackChangeRef.current?.(false);
            },
          },
        });
      });
    }, startDelayMs);

    return () => {
      cancelled = true;
      stopSaveInterval();
      savePosition();
      clearTimer(startTimerRef);
      clearTimer(loopTimerRef);
      clearTimer(hardFailTimerRef);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubInteract();
      observer?.disconnect();
      const p = playerRef.current;
      playerRef.current = null;
      if (p) {
        try {
          p.destroy();
        } catch {
          // ignore
        }
      }
      if (host) host.innerHTML = "";
    };
  }, [trailerKey, startDelayMs, loopDelayMs]);

  useEffect(() => {
    apply();
  }, [paused]);

  return <div ref={containerRef} className={className} aria-hidden />;
}
