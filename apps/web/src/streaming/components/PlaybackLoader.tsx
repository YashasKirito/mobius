import { Check } from "lucide-react";
import type { StreamSource } from "@mobius/shared";

export type LoaderPhase = "searching" | "ranking" | "preparing";

type Props = {
  phase: LoaderPhase;
  source?: StreamSource | null;
  restored?: boolean;
};

const STEPS: { key: LoaderPhase; label: string; desc: string }[] = [
  {
    key: "searching",
    label: "Searching sources",
    desc: "Scanning indexers through Jackett",
  },
  {
    key: "ranking",
    label: "Finding the best pick",
    desc: "Ranking by quality, seeders & audio",
  },
  {
    key: "preparing",
    label: "Preparing your stream",
    desc: "Loading the torrent into TorrServer",
  },
];

const ORDER: LoaderPhase[] = ["searching", "ranking", "preparing"];

function gb(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function PlaybackLoader({ phase, source, restored }: Props) {
  const current = ORDER.indexOf(phase);

  return (
    <div className="dm-ploader">
      <div className="dm-ploader__pearl" />
      <div className="dm-ploader__brand">Møbius</div>
      {restored && (
        <div className="dm-ploader__restored">Restored your saved source</div>
      )}

      <ol className="dm-ploader__steps">
        {STEPS.map((step, i) => {
          const state =
            i < current ? "done" : i === current ? "active" : "pending";
          return (
            <li key={step.key} className={`dm-ploader__step ${state}`}>
              <span className="dm-ploader__icon">
                {state === "done" ? (
                  <Check size={14} strokeWidth={3} />
                ) : state === "active" ? (
                  <span className="dm-ploader__spinner" />
                ) : (
                  <span className="dm-ploader__dot" />
                )}
              </span>
              <span className="dm-ploader__text">
                <span className="dm-ploader__label">{step.label}</span>
                {state === "active" && (
                  <span className="dm-ploader__desc">{step.desc}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>

      {source && (phase === "ranking" || phase === "preparing") && (
        <div className="dm-ploader__pick">
          <span className="dm-ploader__pick-title">{source.title}</span>
          <span className="dm-ploader__pick-meta">
            {source.resolution && <em>{source.resolution}</em>}
            <span>{gb(source.sizeBytes)}</span>
            <span>▲ {source.seeders}</span>
            {source.audio && (
              <span className={source.browserAudio ? "" : "muted"}>
                {source.browserAudio ? "🔊" : "🔇"} {source.audio.toUpperCase()}
              </span>
            )}
            {source.isSeasonPack && <em className="pack">PACK</em>}
          </span>
        </div>
      )}

      <div className="dm-ploader__bar">
        <span className="dm-ploader__bar-fill" />
      </div>
    </div>
  );
}
