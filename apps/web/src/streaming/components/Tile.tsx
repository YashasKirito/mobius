import { useRef } from "react";
import { FALLBACK_BACKDROP, type MediaItem } from "../types";

export type TileAnchor = { top: number; left: number; width: number; height: number };

type Props = {
  item: MediaItem;
  onHover?: (item: MediaItem, anchor: TileAnchor) => void;
  onLeave?: () => void;
  onClick?: (item: MediaItem) => void;
};

export function Tile({ item, onHover, onLeave, onClick }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const enter = () => {
    if (!onHover || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    onHover(item, { top: r.top, left: r.left, width: r.width, height: r.height });
  };

  return (
    <div
      ref={ref}
      className="dm-tile dm-tile--wide"
      onMouseEnter={enter}
      onMouseLeave={onLeave}
      onClick={() => onClick?.(item)}
    >
      <div className="dm-tile__art">
        <img
          className="dm-tile__art_bg"
          src={item.backdropUrl ?? FALLBACK_BACKDROP}
          alt={item.title}
          loading="lazy"
        />
        {item.logoUrl ? (
          <img className="dm-tile__logo" src={item.logoUrl} alt={item.title} />
        ) : (
          <span className="dm-tile__logoFallback">{item.title}</span>
        )}
        {item.progress != null && (
          <div className="dm-tile__progress">
            <span style={{ width: `${item.progress * 100}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
