import { useNavigate, useParams, useSearchParams } from "react-router";
import type { MediaKind } from "@mobius/shared";
import { LoadingOverlay } from "../auth/components/LoadingOverlay";
import { useTitle } from "../queries/catalog";
import { vidcoreMovieUrl, vidcoreTvUrl } from "../lib/vidcore";
import { Watch } from "../streaming/components/Watch";
import { TorrentWatch } from "../streaming/components/TorrentWatch";
import { useSettingsStore } from "../stores/settingsStore";
import { useStreamStatus } from "../queries/stream";

function isKind(value: string | undefined): value is MediaKind {
  return value === "movie" || value === "tv";
}

function parsePositive(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function WatchRoute() {
  const params = useParams<{ kind: string; id: string }>();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const kind = isKind(params.kind) ? params.kind : undefined;
  const numericId = params.id ? Number(params.id) : NaN;
  const id = Number.isFinite(numericId) ? numericId : undefined;

  const playbackMode = useSettingsStore((s) => s.playbackMode);
  const { data: status } = useStreamStatus();
  const { data: item, isPending, isError } = useTitle(kind, id);

  if (!kind || id === undefined) {
    return (
      <FullScreenMessage
        message="Bad URL."
        onBack={() => navigate("/", { replace: true })}
      />
    );
  }

  if (isPending) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--dm-void)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <LoadingOverlay caption="Møbius" sub="LOADING" />
      </div>
    );
  }

  if (isError || !item) {
    return (
      <FullScreenMessage
        message="Title not found."
        onBack={() => navigate("/", { replace: true })}
      />
    );
  }

  const season = parsePositive(search.get("s"), 1);
  const episode = parsePositive(search.get("e"), 1);

  const useTorrent = playbackMode === "torrent" && status?.available === true;

  if (useTorrent) {
    return (
      <TorrentWatch
        kind={kind}
        id={id}
        season={kind === "tv" ? season : undefined}
        episode={kind === "tv" ? episode : undefined}
        title={item.title}
        onClose={() => navigate(-1)}
        onFallback={() =>
          useSettingsStore.getState().setPlaybackMode("vidcore")
        }
      />
    );
  }

  const src =
    kind === "movie" ? vidcoreMovieUrl(id) : vidcoreTvUrl(id, season, episode);
  return <Watch src={src} title={item.title} onClose={() => navigate(-1)} />;
}

function FullScreenMessage({
  message,
  onBack,
}: {
  message: string;
  onBack: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--dm-void)",
        color: "var(--dm-fg-1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div>{message}</div>
      <button type="button" className="dm-btn dm-btn--glass" onClick={onBack}>
        Back to home
      </button>
    </div>
  );
}
