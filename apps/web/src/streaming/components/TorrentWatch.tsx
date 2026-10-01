import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Layers, X } from "lucide-react";
import type { MediaKind, StreamSource, SubtitleTrack } from "@mobius/shared";
import {
  fetchSources,
  fetchSubtitles,
  playStream,
  type StreamError,
} from "../../queries/stream";
import { useSettingsStore } from "../../stores/settingsStore";
import {
  getSelectedSource,
  setSelectedSource,
  sourceKey,
} from "../../lib/sourceSelections";
import {
  getPlaybackPosition,
  setPlaybackPosition,
} from "../../lib/playbackPositions";
import { PlaybackLoader, type LoaderPhase } from "./PlaybackLoader";
import { VideoPlayer } from "./VideoPlayer";

type Props = {
  kind: MediaKind;
  id: number;
  season?: number;
  episode?: number;
  title: string;
  onClose: () => void;
  onFallback: () => void;
};

type Phase = LoaderPhase | "playing" | "error";

function gb(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function TorrentWatch({
  kind,
  id,
  season,
  episode,
  title,
  onClose,
  onFallback,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("searching");
  const [sources, setSources] = useState<StreamSource[]>([]);
  const [activeSource, setActiveSource] = useState<StreamSource | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState(false);
  const [restored, setRestored] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [subtitles, setSubtitles] = useState<SubtitleTrack[]>([]);
  const subtitleLang = useSettingsStore((s) => s.subtitleLang);
  const setSubtitleLang = useSettingsStore((s) => s.setSubtitleLang);
  const subtitleStyle = useSettingsStore((s) => s.subtitleStyle);
  const setSubtitleStyle = useSettingsStore((s) => s.setSubtitleStyle);

  const key = useMemo(
    () => sourceKey(kind, id, season, episode),
    [kind, id, season, episode],
  );
  const posKey = `torrent:${key}`;

  const startPlayback = async (explicit?: StreamSource) => {
    setDecodeError(false);
    setErrorCode(null);
    setStreamUrl(null);
    setDrawerOpen(false);
    try {
      let source = explicit;
      let isRestored = false;
      if (!source) {
        const saved = getSelectedSource(key);
        if (saved) {
          source = saved;
          isRestored = true;
        }
      }
      setRestored(isRestored);

      if (!source) {
        // No remembered source — run the search + ranking once.
        setPhase("searching");
        const list = await fetchSources({ kind, id, s: season, e: episode });
        setSources(list);
        const pick = list[0];
        if (!pick) {
          setErrorCode("no_sources");
          setPhase("error");
          return;
        }
        setActiveSource(pick);
        setPhase("ranking");
        await delay(700); // let the chosen pick register before we prepare it
        source = pick;
      } else {
        setActiveSource(source);
      }

      setPhase("preparing");
      const res = await playStream({ kind, id, s: season, e: episode, source });
      setActiveSource(res.source);
      setStreamUrl(res.streamUrl);
      setPhase("playing");
      // Remember whatever actually played, so next time we replay it directly.
      setSelectedSource(key, res.source);
    } catch (err) {
      setErrorCode((err as StreamError)?.code ?? "failed");
      setPhase("error");
    }
  };

  // Start on mount / when the title (or episode) changes.
  useEffect(() => {
    void startPlayback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, season, episode]);

  // Look up subtitle tracks in parallel — never blocks playback.
  useEffect(() => {
    let cancelled = false;
    setSubtitles([]);
    fetchSubtitles({ kind, id, s: season, e: episode }).then((tracks) => {
      if (!cancelled) setSubtitles(tracks);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, id, season, episode]);

  const openDrawer = async () => {
    setDrawerOpen(true);
    if (sources.length === 0) {
      try {
        const list = await fetchSources({ kind, id, s: season, e: episode });
        setSources(list);
      } catch {
        // leave empty; drawer shows the empty state
      }
    }
  };

  const selectSource = (source: StreamSource) => {
    setDrawerOpen(false);
    void startPlayback(source);
  };

  // Resume + persist playback position.
  const onLoadedMetadata = (v: HTMLVideoElement) => {
    const saved = getPlaybackPosition(posKey);
    if (saved && saved < v.duration - 5) v.currentTime = saved;
  };
  const onProgress = (v: HTMLVideoElement) => {
    if (!v.paused) setPlaybackPosition(posKey, v.currentTime);
  };

  const isLoading =
    phase === "searching" || phase === "ranking" || phase === "preparing";
  const noSources = phase === "error" && errorCode === "no_sources";

  const audioBadge = activeSource?.audio ? (
    <span
      className={
        "dm-torrent__audio" + (activeSource.browserAudio ? "" : " muted")
      }
    >
      {activeSource.browserAudio ? "🔊" : "🔇"} {activeSource.audio.toUpperCase()}
    </span>
  ) : null;

  const backButton = (
    <button
      type="button"
      className="dm-watch__back"
      onClick={onClose}
      aria-label="Back"
    >
      <ArrowLeft size={18} />
      <span>Back</span>
    </button>
  );

  const chromeTop = (
    <>
      {backButton}
      <div className="dm-torrent__titlewrap">
        <span className="dm-torrent__title">{title}</span>
        {activeSource && (
          <span className="dm-torrent__nowmeta">
            {activeSource.resolution && <em>{activeSource.resolution}</em>}
            {audioBadge}
          </span>
        )}
      </div>
      <button
        type="button"
        className="dm-btn dm-btn--glass dm-torrent__sources-btn"
        onClick={() => (drawerOpen ? setDrawerOpen(false) : void openDrawer())}
      >
        <Layers size={16} />
        <span>Sources</span>
      </button>
    </>
  );

  return (
    <div className="dm-watch">
      {streamUrl && phase === "playing" && (
        <VideoPlayer
          src={streamUrl}
          videoRef={videoRef}
          chromeTop={chromeTop}
          chromePinned={drawerOpen}
          subtitles={subtitles}
          initialSubLang={subtitleLang}
          onSubLangChange={setSubtitleLang}
          subtitleStyle={subtitleStyle}
          onSubtitleStyleChange={setSubtitleStyle}
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onProgress}
          onError={() => setDecodeError(true)}
        />
      )}

      {isLoading && (
        <div className="dm-torrent__overlay">
          <span className="dm-dotgrid" aria-hidden="true" />
          <div className="dm-torrent__overlay-back">{backButton}</div>
          <PlaybackLoader
            phase={phase}
            source={activeSource}
            restored={restored}
          />
        </div>
      )}

      {phase === "error" && (
        <div className="dm-torrent__overlay dm-torrent__message">
          <div className="dm-torrent__overlay-back">{backButton}</div>
          <div>
            {noSources
              ? "No torrent sources found."
              : "Couldn't start this stream."}
          </div>
          <div className="dm-torrent__actions">
            <button
              type="button"
              className="dm-btn dm-btn--glass"
              onClick={openDrawer}
            >
              Choose a source
            </button>
            <button
              type="button"
              className="dm-btn dm-btn--glass"
              onClick={onFallback}
            >
              Play via VidCore
            </button>
          </div>
        </div>
      )}

      {decodeError && streamUrl && (
        <div className="dm-torrent__decode">
          <span>This release can't play in the browser — pick another source.</span>
          <button
            type="button"
            className="dm-btn dm-btn--glass"
            onClick={openDrawer}
          >
            Sources
          </button>
        </div>
      )}

      {drawerOpen && (
        <>
          <button
            type="button"
            className="dm-torrent__scrim"
            aria-label="Close sources"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="dm-torrent__drawer">
            <div className="dm-torrent__drawer-head">
              <span>Sources</span>
              <button
                type="button"
                className="dm-torrent__drawer-close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            {sources.length === 0 ? (
              <div className="dm-torrent__drawer-empty">
                No alternatives found.
              </div>
            ) : (
              <ul className="dm-torrent__list">
                {sources.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={
                        "dm-torrent__source" +
                        (s.id === activeSource?.id ? " active" : "")
                      }
                      onClick={() => selectSource(s)}
                    >
                      <span className="dm-torrent__source-title">{s.title}</span>
                      <span className="dm-torrent__source-meta">
                        {s.resolution && <em>{s.resolution}</em>}
                        <span>{gb(s.sizeBytes)}</span>
                        <span>▲ {s.seeders}</span>
                        {s.audio && (
                          <span
                            className={
                              "dm-torrent__audio" +
                              (s.browserAudio ? "" : " muted")
                            }
                            title={
                              s.browserAudio
                                ? "Plays in browser"
                                : "Audio may not play in browser"
                            }
                          >
                            {s.browserAudio ? "🔊" : "🔇"}{" "}
                            {s.audio.toUpperCase()}
                          </span>
                        )}
                        {s.isSeasonPack && <em className="pack">PACK</em>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
