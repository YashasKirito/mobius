import { useNavigate, useSearchParams } from "react-router";
import { LoadingOverlay } from "../auth/components/LoadingOverlay";
import { useSearch } from "../queries/catalog";
import { Footer } from "../streaming/components/Footer";
import { Tile } from "../streaming/components/Tile";
import { TopNav } from "../streaming/components/TopNav";
import { itemKey, type MediaItem } from "../streaming/types";
import "../streaming/styles/dark-morphism.css";

export function SearchRoute() {
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const q = (search.get("q") ?? "").trim();

  const { data, isPending, isError } = useSearch(q);

  const openTitle = (item: MediaItem) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    navigate(`/search/title/${item.kind}/${item.id}${qs}`);
  };

  return (
    <>
      <TopNav />
      <main className="dm-search">
        <header className="dm-search__head">
          <div className="dm-search__eyebrow">Results for</div>
          <h1 className="dm-search__title">{q || "—"}</h1>
        </header>

        {!q ? (
          <div className="dm-search__empty">Type something in the search bar above.</div>
        ) : isPending ? (
          <div className="dm-search__loading">
            <LoadingOverlay caption="Møbius" sub="SEARCHING" />
          </div>
        ) : isError ? (
          <div className="dm-search__empty">Search failed. Try again.</div>
        ) : !data || data.items.length === 0 ? (
          <div className="dm-search__empty">No matches for “{q}”.</div>
        ) : (
          <div className="dm-search__grid">
            {data.items.map((it) => (
              <Tile key={itemKey(it)} item={it} onClick={openTitle} />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
