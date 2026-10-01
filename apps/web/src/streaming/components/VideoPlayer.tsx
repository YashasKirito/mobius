import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Captions,
  Maximize,
  Minimize,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Timer,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { SubtitleTrack } from "@mobius/shared";
import { subtitleFileUrl } from "../../queries/stream";
import type { SubtitleStyle } from "../../stores/settingsStore";
import { DEFAULT_SUBTITLE_STYLE } from "../../stores/settingsStore";

const SUB_COLORS = ["#ffffff", "#f2d024", "#86e0ff", "#7ce38b", "#ff9fb2"];
const BACKGROUNDS: { key: SubtitleStyle["background"]; label: string }[] = [
  { key: "none", label: "None" },
  { key: "outline", label: "Outline" },
  { key: "box", label: "Box" },
];
const OFFSET_STEP = 0.25;
const OFFSET_MAX = 15;

type Props = {
  src: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  chromeTop?: ReactNode;
  chromePinned?: boolean;
  subtitles?: SubtitleTrack[];
  initialSubLang?: string | null;
  onSubLangChange?: (lang: string | null) => void;
  subtitleStyle?: SubtitleStyle;
  onSubtitleStyleChange?: (patch: Partial<SubtitleStyle>) => void;
  onError?: () => void;
  onLoadedMetadata?: (v: HTMLVideoElement) => void;
  onTimeUpdate?: (v: HTMLVideoElement) => void;
};

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

// Render a VTT cue as safe HTML: drop styling/voice tags, keep <i>/<b>/<u>,
// turn newlines into breaks. Escaping first means no attributes or scripts
// survive — only the three emphasis tags are re-enabled.
function renderCue(raw: string): string {
  const stripped = raw.replace(/<\/?(?!i>|b>|u>|i |b |u )[a-z][^>]*>/gi, "");
  const escaped = stripped
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .replace(/&lt;(\/?)([ibu])&gt;/gi, "<$1$2>")
    .replace(/\n/g, "<br>");
}

export function VideoPlayer({
  src,
  videoRef,
  chromeTop,
  chromePinned = false,
  subtitles,
  initialSubLang,
  onSubLangChange,
  subtitleStyle = DEFAULT_SUBTITLE_STYLE,
  onSubtitleStyleChange,
  onError,
  onLoadedMetadata,
  onTimeUpdate,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const ccRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const subInit = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [subMenuOpen, setSubMenuOpen] = useState(false);
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const [subOffset, setSubOffset] = useState(0);
  const [subText, setSubText] = useState("");

  const activeTrack = subtitles?.find((t) => t.id === activeSubId) ?? null;
  const style = subtitleStyle;

  const tryPlay = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      await v.play();
    } catch {
      try {
        v.muted = true;
        await v.play();
        setNeedsUnmute(true);
      } catch {
        // even muted playback was refused — leave the big play button up
      }
    }
  }, [videoRef]);

  const unmute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    setNeedsUnmute(false);
  }, [videoRef]);

  const poke = useCallback(() => {
    setChromeVisible(true);
    window.clearTimeout(hideTimer.current);
    if (playing && !chromePinned && !scrubbing && !buffering && !subMenuOpen) {
      hideTimer.current = window.setTimeout(
        () => setChromeVisible(false),
        2600,
      );
    }
  }, [playing, chromePinned, scrubbing, buffering, subMenuOpen]);

  useEffect(() => {
    poke();
    return () => window.clearTimeout(hideTimer.current);
  }, [poke]);

  // Focus the player so keyboard shortcuts work without a click first.
  useEffect(() => {
    const t = window.setTimeout(() => containerRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  // Apply the remembered subtitle language once tracks arrive.
  useEffect(() => {
    if (subInit.current || !subtitles || subtitles.length === 0) return;
    subInit.current = true;
    if (initialSubLang) {
      const match = subtitles.find((t) => t.language === initialSubLang);
      if (match) setActiveSubId(match.id);
    }
  }, [subtitles, initialSubLang]);

  // We render cues ourselves, so keep the native track "hidden" (parsed but not
  // painted) when active, and fully disabled otherwise.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const apply = () => {
      const tracks = v.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        const tt = tracks[i];
        if (tt) tt.mode = activeSubId ? "hidden" : "disabled";
      }
    };
    apply();
    const t = window.setTimeout(apply, 300);
    return () => window.clearTimeout(t);
  }, [activeSubId, videoRef]);

  // Different releases sync differently — reset the offset on a new source.
  useEffect(() => {
    setSubOffset(0);
  }, [src]);

  // Pick the cue to display for the current time, shifted by the sync offset.
  const refreshCue = useCallback(() => {
    const v = videoRef.current;
    if (!v || !activeSubId) {
      setSubText("");
      return;
    }
    const cues = v.textTracks[0]?.cues;
    if (!cues) {
      setSubText("");
      return;
    }
    const t = v.currentTime - subOffset;
    let text = "";
    for (let i = 0; i < cues.length; i++) {
      const c = cues[i];
      if (c && c.startTime <= t && t <= c.endTime) {
        text = (c as VTTCue).text;
        break;
      }
    }
    setSubText(text);
  }, [videoRef, activeSubId, subOffset]);

  // Re-evaluate immediately when the offset or selected track changes.
  useEffect(() => {
    refreshCue();
  }, [refreshCue]);

  // Close the subtitle menu on an outside click.
  useEffect(() => {
    if (!subMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ccRef.current && !ccRef.current.contains(e.target as Node)) {
        setSubMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [subMenuOpen]);

  const selectSub = (track: SubtitleTrack | null) => {
    setActiveSubId(track?.id ?? null);
    onSubLangChange?.(track?.language ?? null);
  };

  const nudgeOffset = (delta: number) =>
    setSubOffset((o) =>
      Math.min(OFFSET_MAX, Math.max(-OFFSET_MAX, Number((o + delta).toFixed(2)))),
    );

  // Fullscreen state follows the document.
  useEffect(() => {
    const onFs = () =>
      setFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  }, [videoRef]);

  const skip = useCallback(
    (delta: number) => {
      const v = videoRef.current;
      if (!v || !Number.isFinite(v.duration)) return;
      v.currentTime = Math.min(v.duration, Math.max(0, v.currentTime + delta));
      poke();
    },
    [videoRef, poke],
  );

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) void document.exitFullscreen();
    else void el.requestFullscreen();
  }, []);

  const seekToClientX = useCallback(
    (clientX: number) => {
      const rail = railRef.current;
      const v = videoRef.current;
      if (!rail || !v || !Number.isFinite(v.duration)) return;
      const rect = rail.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      v.currentTime = ratio * v.duration;
      setCurrent(v.currentTime);
    },
    [videoRef],
  );

  const onRailPointerDown = (e: React.PointerEvent) => {
    setScrubbing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    seekToClientX(e.clientX);
  };
  const onRailPointerMove = (e: React.PointerEvent) => {
    if (scrubbing) seekToClientX(e.clientX);
  };
  const onRailPointerUp = (e: React.PointerEvent) => {
    setScrubbing(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // Keyboard shortcuts, scoped to the player container.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT") return; // let sliders handle their own keys
    const onButton = target.tagName === "BUTTON";
    switch (e.key) {
      case " ":
      case "k":
        if (onButton) return;
        e.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        e.preventDefault();
        skip(-5);
        break;
      case "ArrowRight":
        e.preventDefault();
        skip(5);
        break;
      case "ArrowUp": {
        e.preventDefault();
        const v = videoRef.current;
        if (v) v.volume = Math.min(1, v.volume + 0.1);
        break;
      }
      case "ArrowDown": {
        e.preventDefault();
        const v = videoRef.current;
        if (v) v.volume = Math.max(0, v.volume - 0.1);
        break;
      }
      case "f":
        toggleFullscreen();
        break;
      case "m":
        toggleMute();
        break;
      default:
        break;
    }
  };

  const setStyle = (patch: Partial<SubtitleStyle>) =>
    onSubtitleStyleChange?.(patch);

  const pct = duration > 0 ? (current / duration) * 100 : 0;
  const bufPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const offsetLabel = `${subOffset > 0 ? "+" : ""}${subOffset.toFixed(2)}s`;

  return (
    <div
      ref={containerRef}
      className={
        "dm-vp" +
        (chromeVisible ? " chrome" : "") +
        (playing ? " playing" : "")
      }
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseMove={poke}
      onPointerDown={poke}
    >
      <video
        ref={videoRef}
        className="dm-vp__video"
        src={src}
        preload="auto"
        playsInline
        onClick={togglePlay}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onVolumeChange={(e) => {
          const v = e.currentTarget;
          setVolume(v.volume);
          const m = v.muted || v.volume === 0;
          setMuted(m);
          if (!m) setNeedsUnmute(false);
        }}
        onLoadedMetadata={(e) => {
          setDuration(e.currentTarget.duration);
          onLoadedMetadata?.(e.currentTarget);
          void tryPlay();
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setCurrent(v.currentTime);
          if (v.buffered.length) {
            setBuffered(v.buffered.end(v.buffered.length - 1));
          }
          onTimeUpdate?.(v);
          refreshCue();
        }}
        onError={onError}
      >
        {activeTrack && (
          <track
            key={activeTrack.id}
            kind="subtitles"
            src={subtitleFileUrl(activeTrack.id)}
            srcLang={activeTrack.language}
            label={activeTrack.label}
            default
          />
        )}
      </video>

      {/* Our own subtitle layer — fully styleable and offset-aware. */}
      {activeSubId && subText && (
        <div className="dm-vp__subs" style={{ bottom: `${style.position}%` }}>
          <span
            className={`dm-vp__subs-text bg-${style.background}`}
            style={{
              color: style.color,
              fontSize: `clamp(15px, ${(3.1 * style.size).toFixed(2)}vh, 60px)`,
            }}
            dangerouslySetInnerHTML={{ __html: renderCue(subText) }}
          />
        </div>
      )}

      {/* Center: buffering ring, or a pearl play button when paused. */}
      <div className="dm-vp__center">
        {buffering ? (
          <span className="dm-vp__buffer" aria-label="Buffering" />
        ) : (
          !playing && (
            <button
              type="button"
              className="dm-vp__bigplay"
              onClick={togglePlay}
              aria-label="Play"
            >
              <Play size={30} fill="currentColor" />
            </button>
          )
        )}
      </div>

      {/* Autoplay started muted (browser policy) — offer a one-tap unmute. */}
      {needsUnmute && (
        <button type="button" className="dm-vp__unmute" onClick={unmute}>
          <VolumeX size={16} />
          <span>Tap to unmute</span>
        </button>
      )}

      {/* Top chrome (back / title / sources), provided by the parent. */}
      {chromeTop && <div className="dm-vp__top">{chromeTop}</div>}

      {/* Bottom control cluster. */}
      <div className="dm-vp__bottom">
        <div
          ref={railRef}
          className={"dm-vp__rail" + (scrubbing ? " scrubbing" : "")}
          onPointerDown={onRailPointerDown}
          onPointerMove={onRailPointerMove}
          onPointerUp={onRailPointerUp}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration) || 0}
          aria-valuenow={Math.floor(current)}
          tabIndex={0}
        >
          <span className="dm-vp__rail-track" />
          <span className="dm-vp__rail-buffer" style={{ width: `${bufPct}%` }} />
          <span className="dm-vp__rail-fill" style={{ width: `${pct}%` }} />
          <span className="dm-vp__rail-handle" style={{ left: `${pct}%` }} />
        </div>

        <div className="dm-vp__controls">
          <button
            type="button"
            className="dm-vp__btn"
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
          </button>
          <button
            type="button"
            className="dm-vp__btn"
            onClick={() => skip(-10)}
            aria-label="Back 10 seconds"
          >
            <RotateCcw size={18} />
          </button>
          <button
            type="button"
            className="dm-vp__btn"
            onClick={() => skip(10)}
            aria-label="Forward 10 seconds"
          >
            <RotateCw size={18} />
          </button>

          <div className="dm-vp__volume">
            <button
              type="button"
              className="dm-vp__btn"
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? (
                <VolumeX size={18} />
              ) : (
                <Volume2 size={18} />
              )}
            </button>
            <input
              className="dm-vp__vol-slider"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => {
                const v = videoRef.current;
                if (!v) return;
                v.muted = false;
                v.volume = Number(e.target.value);
              }}
              aria-label="Volume"
            />
          </div>

          <span className="dm-vp__time">
            {formatTime(current)} <span className="sep">/</span>{" "}
            {formatTime(duration)}
          </span>

          <span className="dm-vp__spacer" />

          {subtitles && subtitles.length > 0 && (
            <div className="dm-vp__cc" ref={ccRef}>
              <button
                type="button"
                className={"dm-vp__btn" + (activeSubId ? " on" : "")}
                onClick={() => setSubMenuOpen((o) => !o)}
                aria-label="Subtitles"
                aria-expanded={subMenuOpen}
              >
                <Captions size={18} />
              </button>
              {subMenuOpen && (
                <div className="dm-vp__ccmenu">
                  <div className="dm-vp__ccmenu-head">Language</div>
                  <button
                    type="button"
                    className={"dm-vp__ccitem" + (!activeSubId ? " active" : "")}
                    onClick={() => selectSub(null)}
                  >
                    Off
                  </button>
                  {subtitles.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={
                        "dm-vp__ccitem" + (t.id === activeSubId ? " active" : "")
                      }
                      onClick={() => selectSub(t)}
                    >
                      {t.label}
                    </button>
                  ))}

                  {activeSubId && (
                    <>
                      <div className="dm-vp__ccsep" />

                      <div className="dm-vp__ccrow">
                        <span className="dm-vp__cclabel">Text size</span>
                        <input
                          className="dm-vp__ccslider"
                          type="range"
                          min={0.6}
                          max={2.2}
                          step={0.1}
                          value={style.size}
                          onChange={(e) =>
                            setStyle({ size: Number(e.target.value) })
                          }
                          aria-label="Subtitle text size"
                        />
                      </div>

                      <div className="dm-vp__ccrow">
                        <span className="dm-vp__cclabel">Colour</span>
                        <span className="dm-vp__swatches">
                          {SUB_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              className={
                                "dm-vp__swatch" +
                                (style.color === c ? " active" : "")
                              }
                              style={{ background: c }}
                              onClick={() => setStyle({ color: c })}
                              aria-label={`Colour ${c}`}
                            />
                          ))}
                        </span>
                      </div>

                      <div className="dm-vp__ccrow">
                        <span className="dm-vp__cclabel">Background</span>
                        <span className="dm-vp__seg">
                          {BACKGROUNDS.map((b) => (
                            <button
                              key={b.key}
                              type="button"
                              className={
                                "dm-vp__segbtn" +
                                (style.background === b.key ? " active" : "")
                              }
                              onClick={() => setStyle({ background: b.key })}
                            >
                              {b.label}
                            </button>
                          ))}
                        </span>
                      </div>

                      <div className="dm-vp__ccrow">
                        <span className="dm-vp__cclabel">Position</span>
                        <input
                          className="dm-vp__ccslider"
                          type="range"
                          min={2}
                          max={80}
                          step={1}
                          value={style.position}
                          onChange={(e) =>
                            setStyle({ position: Number(e.target.value) })
                          }
                          aria-label="Subtitle vertical position"
                        />
                      </div>

                      <div className="dm-vp__ccrow">
                        <span className="dm-vp__cclabel">
                          <Timer size={13} /> Sync
                        </span>
                        <span className="dm-vp__offset">
                          <button
                            type="button"
                            className="dm-vp__stepbtn"
                            onClick={() => nudgeOffset(-OFFSET_STEP)}
                            aria-label="Subtitles earlier"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="dm-vp__offval">{offsetLabel}</span>
                          <button
                            type="button"
                            className="dm-vp__stepbtn"
                            onClick={() => nudgeOffset(OFFSET_STEP)}
                            aria-label="Subtitles later"
                          >
                            <Plus size={13} />
                          </button>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="dm-vp__btn"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          >
            {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
