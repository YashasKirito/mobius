import { FALLBACK_POSTER, itemKey, type MediaItem } from "../types";

type Props = {
  items: MediaItem[];
  title?: string;
  accent?: string;
  onClick?: (item: MediaItem) => void;
};

export function TopTenRow({
  items,
  title = "This Week",
  accent = "Top 10",
  onClick,
}: Props) {
  return (
    <section className="dm-row">
      <div className="dm-row__head">
        <h2 className="dm-row__title">
          <span className="accent">{accent} </span>
          {title}
        </h2>
        <button type="button" className="dm-row__see-all">
          See all →
        </button>
      </div>
      <div className="dm-rank-row">
        {items.slice(0, 10).map((it, i) => (
          <div
            key={itemKey(it)}
            className="dm-rank"
            onClick={() => onClick?.(it)}
          >
            <div className="dm-rank__num">{i + 1}</div>
            <div className="dm-rank__art">
              <img src={it.posterUrl ?? FALLBACK_POSTER} alt={it.title} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
