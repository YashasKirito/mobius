import { useState } from "react";
import { Info, Play, Plus } from "lucide-react";
import { Trailer } from "./Trailer";

type Props = {
  bg: string;
  eyebrow: string;
  title: string;
  logoUrl?: string | null;
  meta: string[];
  synopsis: string;
  trailerKey?: string | null;
  paused?: boolean;
  onPlay?: () => void;
  onMore?: () => void;
};

export function Hero({
  bg,
  eyebrow,
  title,
  logoUrl,
  meta,
  synopsis,
  trailerKey,
  paused,
  onPlay,
  onMore,
}: Props) {
  const [playing, setPlaying] = useState(false);
  const className = `dm-hero${playing ? " dm-hero--playing" : ""}`;
  return (
    <section className={className}>
      <div className="dm-hero__bg" style={{ backgroundImage: `url(${bg})` }} />
      {trailerKey && (
        <Trailer
          trailerKey={trailerKey}
          paused={paused ?? false}
          onPlaybackChange={setPlaying}
        />
      )}
      <div className="dm-hero__veil" />
      <div className="dm-hero__grain" />
      <div className="dm-hero__content">
        <div className="dm-hero__eyebrow">{eyebrow}</div>
        {logoUrl ? (
          <img className="dm-hero__logo" src={logoUrl} alt={title} />
        ) : (
          <h1 className="dm-hero__title">{title}</h1>
        )}
        {meta.length > 0 && (
          <div className="dm-hero__meta">
            <span>{meta.join(" · ")}</span>
          </div>
        )}
        <p className="dm-hero__synopsis">{synopsis}</p>
        <div className="dm-hero__actions">
          <button type="button" className="dm-btn dm-btn--primary" onClick={onPlay}>
            <Play size={18} fill="currentColor" />
            Play
          </button>
          <button type="button" className="dm-btn dm-btn--glass" onClick={onMore}>
            <Info size={18} />
            More Info
          </button>
          <button
            type="button"
            className="dm-btn dm-btn--icon dm-btn--glass"
            aria-label="Add to list"
          >
            <Plus size={20} />
          </button>
        </div>
      </div>
    </section>
  );
}
