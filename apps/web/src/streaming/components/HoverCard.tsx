import { useState } from "react";
import { Play, Plus, ThumbsUp } from "lucide-react";
import { useTitle } from "../../queries/catalog";
import { FALLBACK_BACKDROP, type MediaItem } from "../types";
import type { TileAnchor } from "./Tile";
import { Trailer } from "./Trailer";

type Props = {
  item: MediaItem;
  anchor: TileAnchor;
  onClose: () => void;
  onPlay: (item: MediaItem) => void;
};

const CARD_WIDTH = 380;
const HOVER_TRAILER_DELAY_MS = 1500;

export function HoverCard({ item, anchor, onClose, onPlay }: Props) {
  const top = anchor.top + window.scrollY - 30;
  const rawLeft = anchor.left + anchor.width / 2 - CARD_WIDTH / 2;
  const left = Math.max(16, Math.min(rawLeft, window.innerWidth - CARD_WIDTH - 16));

  const { data: detail } = useTitle(item.kind, item.id);
  const trailerKey = detail?.trailers?.[0]?.key ?? null;
  const [playing, setPlaying] = useState(false);

  const artClass = `dm-hover-card__art${playing ? " dm-hover-card__art--playing" : ""}`;

  return (
    <div
      className="dm-hover-card"
      style={{ top, left }}
      onMouseLeave={onClose}
    >
      <div className={artClass}>
        <img src={item.backdropUrl ?? FALLBACK_BACKDROP} alt={item.title} />
        {trailerKey && (
          <Trailer
            trailerKey={trailerKey}
            paused={false}
            startDelayMs={HOVER_TRAILER_DELAY_MS}
            onPlaybackChange={setPlaying}
          />
        )}
        {item.live && (
          <div className="dm-hover-card__live">
            <span className="pulse" />
            Live
          </div>
        )}
      </div>
      <div className="dm-hover-card__body">
        <div className="dm-hover-card__actions">
          <button
            type="button"
            className="dm-hover-card__icon-btn dm-hover-card__icon-btn--play"
            onClick={() => onPlay(item)}
            aria-label="Play"
          >
            <Play size={16} />
          </button>
          <button type="button" className="dm-hover-card__icon-btn" aria-label="Add">
            <Plus size={16} />
          </button>
          <button type="button" className="dm-hover-card__icon-btn" aria-label="Like">
            <ThumbsUp size={16} />
          </button>
          <div style={{ flex: 1 }} />
          {item.rating && (
            <span className="dm-hover-card__rating">{item.rating}</span>
          )}
        </div>
        <h3 className="dm-hover-card__title">{item.title}</h3>
        {item.runtime && (
          <div className="dm-hover-card__meta">
            <span>{item.runtime}</span>
          </div>
        )}
        {item.tags.length > 0 && (
          <div className="dm-hover-card__tags">
            {item.tags.slice(0, 4).map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
