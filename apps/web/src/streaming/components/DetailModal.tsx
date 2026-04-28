import { useState } from "react";
import { Play, Plus, Share2, ThumbsUp, X } from "lucide-react";
import { FALLBACK_BACKDROP, type MediaDetail, type MediaItem } from "../types";
import { EpisodeList } from "./EpisodeList";
import { Trailer } from "./Trailer";

type Props = {
  item: MediaDetail;
  onClose: () => void;
  onPlay: (item: MediaItem) => void;
};

const MODAL_TRAILER_DELAY_MS = 1500;

export function DetailModal({ item, onClose, onPlay }: Props) {
  const audio = item.languages.length > 0 ? item.languages.join(" · ") : "—";
  const directors = item.directors.length > 0 ? item.directors.join(", ") : "—";
  const cast =
    item.cast.length > 0
      ? item.cast
          .slice(0, 6)
          .map((c) => c.name)
          .join(" · ")
      : "—";
  const genres = item.tags.length > 0 ? item.tags.join(" · ") : "—";

  const trailerKey = item.trailers?.[0]?.key ?? null;
  const [playing, setPlaying] = useState(false);
  const heroClass = `dm-modal__hero${playing ? " dm-modal__hero--playing" : ""}`;

  return (
    <div className="dm-modal-scrim" onClick={onClose}>
      <div className="dm-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="dm-modal__close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={20} />
        </button>
        <div className={heroClass}>
          <img src={item.backdropUrl ?? FALLBACK_BACKDROP} alt={item.title} />
          {trailerKey && (
            <Trailer
              trailerKey={trailerKey}
              paused={false}
              startDelayMs={MODAL_TRAILER_DELAY_MS}
              onPlaybackChange={setPlaying}
            />
          )}
          <div className="dm-modal__hero-text">
            {item.logoUrl ? (
              <img
                className="dm-modal__hero-logo"
                src={item.logoUrl}
                alt={item.title}
              />
            ) : (
              <h2 className="dm-modal__title">{item.title}</h2>
            )}
            <div className="dm-modal__hero-actions">
              <button
                type="button"
                className="dm-btn dm-btn--primary"
                onClick={() => onPlay(item)}
              >
                <Play size={18} />
                Play
              </button>
              <button type="button" className="dm-btn dm-btn--glass">
                <Plus size={18} />
                My List
              </button>
              <button
                type="button"
                className="dm-btn dm-btn--icon dm-btn--glass"
                aria-label="Like"
              >
                <ThumbsUp size={18} />
              </button>
              <button
                type="button"
                className="dm-btn dm-btn--icon dm-btn--glass"
                aria-label="Share"
              >
                <Share2 size={18} />
              </button>
            </div>
          </div>
        </div>
        <div className="dm-modal__body">
          <div>
            <div className="dm-modal__meta-row">
              {item.rating && (
                <span className="dm-hover-card__rating">{item.rating}</span>
              )}
              {item.releaseYear && <span>{item.releaseYear}</span>}
              {item.runtime && (
                <>
                  <span>·</span>
                  <span>{item.runtime}</span>
                </>
              )}
            </div>
            <p className="dm-modal__synopsis">
              {item.overview || "No overview available."}
            </p>
          </div>
          <dl className="dm-modal__sidebar">
            <dt>Cast</dt>
            <dd>{cast}</dd>
            <dt>Genres</dt>
            <dd>{genres}</dd>
          </dl>
        </div>
        {item.kind === "tv" && item.seasons && item.seasons.length > 0 && (
          <EpisodeList tvId={item.id} seasons={item.seasons} />
        )}
      </div>
    </div>
  );
}
