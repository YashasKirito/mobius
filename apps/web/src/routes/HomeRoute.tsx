import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { HomeRow } from "@mobius/shared";
import { LoadingOverlay } from "../auth/components/LoadingOverlay";
import { useHomeCatalog } from "../queries/catalog";
import { Footer } from "../streaming/components/Footer";
import { Hero } from "../streaming/components/Hero";
import { HoverCard } from "../streaming/components/HoverCard";
import { Row } from "../streaming/components/Row";
import { Tile, type TileAnchor } from "../streaming/components/Tile";
import { TopNav } from "../streaming/components/TopNav";
import { TopTenRow } from "../streaming/components/TopTenRow";
import { itemKey, type MediaItem } from "../streaming/types";
import "../streaming/styles/dark-morphism.css";

type HoverState = { item: MediaItem; anchor: TileAnchor };

const TRENDING_ROW_ID = "trending";
const HOVER_DELAY_MS = 500;
const SCROLL_QUIET_MS = 200;

function buildHeroMeta(hero: MediaItem): string[] {
  const out: string[] = [];
  if (hero.runtime) out.push(hero.runtime);
  if (hero.rating) out.push(hero.rating);
  return out;
}

function heroEyebrow(hero: MediaItem): string {
  const kindLabel = hero.kind === "tv" ? "Series" : "Film";
  return `Trending Now · ${kindLabel}`;
}

function StandardRow({
  row,
  onHover,
  onTileLeave,
  onClick,
}: {
  row: HomeRow;
  onHover: (item: MediaItem, anchor: TileAnchor) => void;
  onTileLeave: () => void;
  onClick: (item: MediaItem) => void;
}) {
  return (
    <Row title={row.title} accent={row.accent}>
      {row.items.map((it) => (
        <Tile
          key={itemKey(it)}
          item={it}
          onHover={onHover}
          onLeave={onTileLeave}
          onClick={onClick}
        />
      ))}
    </Row>
  );
}

export function HomeRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hover, setHover] = useState<HoverState | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const scrollingUntil = useRef<number>(0);
  const { data, isPending, isError } = useHomeCatalog();

  const cancelPendingHover = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  useEffect(() => {
    // Capture-phase listener catches scroll on row scrollers + window itself,
    // since `scroll` doesn't bubble. Any scroll postpones hovers by SCROLL_QUIET_MS.
    const onAnyScroll = () => {
      scrollingUntil.current = Date.now() + SCROLL_QUIET_MS;
      cancelPendingHover();
    };
    document.addEventListener("scroll", onAnyScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      document.removeEventListener("scroll", onAnyScroll, { capture: true });
      cancelPendingHover();
    };
  }, []);

  const onHover = (item: MediaItem, anchor: TileAnchor) => {
    if (Date.now() < scrollingUntil.current) return;
    cancelPendingHover();
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      setHover({ item, anchor });
    }, HOVER_DELAY_MS);
  };

  const onTileLeave = () => {
    // Cursor brushed past — kill any pending show but leave any visible card alone.
    cancelPendingHover();
  };

  const onLeave = () => {
    cancelPendingHover();
    setHover(null);
  };

  const openTitle = (item: MediaItem) => {
    setHover(null);
    navigate(`/title/${item.kind}/${item.id}`, {
      state: { backgroundLocation: location },
    });
  };
  const playTitle = (item: MediaItem) => {
    setHover(null);
    navigate(`/watch/${item.kind}/${item.id}`);
  };

  if (isPending) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--dm-bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <LoadingOverlay caption="Møbius" sub="LOADING" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--dm-bg)",
          color: "var(--dm-fg-1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 14,
          fontFamily: "var(--dm-font-display)",
        }}
      >
        <div>Catalog unavailable. Try again later.</div>
      </div>
    );
  }

  const hero = data.hero;
  const heroPaused =
    location.pathname.startsWith("/title/") ||
    location.pathname.startsWith("/watch/");

  return (
    <>
      <TopNav active="Home" />
      <Hero
        bg={hero.backdropUrl ?? hero.posterUrl ?? "/assets/media/midnight-rain-wide.svg"}
        eyebrow={heroEyebrow(hero)}
        title={hero.title}
        logoUrl={hero.logoUrl}
        meta={buildHeroMeta(hero)}
        synopsis={hero.overview || "Featured tonight on Møbius."}
        trailerKey={data.heroTrailerKey}
        paused={heroPaused}
        onPlay={() => playTitle(hero)}
        onMore={() => openTitle(hero)}
      />

      <div onMouseLeave={onLeave}>
        {data.rows.map((row) => {
          if (row.id === TRENDING_ROW_ID) {
            return (
              <TopTenRow
                key={row.id}
                items={row.items}
                title={row.title}
                accent={row.accent}
                onClick={openTitle}
              />
            );
          }
          return (
            <StandardRow
              key={row.id}
              row={row}
              onHover={onHover}
              onTileLeave={onTileLeave}
              onClick={openTitle}
            />
          );
        })}

        {hover && (
          <HoverCard
            item={hover.item}
            anchor={hover.anchor}
            onClose={onLeave}
            onPlay={playTitle}
          />
        )}
      </div>

      <Footer />
    </>
  );
}
