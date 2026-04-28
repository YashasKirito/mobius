import type { ReactNode } from "react";

type Props = {
  title: string;
  accent?: string;
  children: ReactNode;
  onSeeAll?: () => void;
};

export function Row({ title, accent, children, onSeeAll }: Props) {
  return (
    <section className="dm-row">
      <div className="dm-row__head">
        <h2 className="dm-row__title">
          {accent && <span className="accent">{accent} </span>}
          {title}
        </h2>
        <button type="button" className="dm-row__see-all" onClick={onSeeAll}>
          See all →
        </button>
      </div>
      <div className="dm-row__scroller">{children}</div>
    </section>
  );
}
