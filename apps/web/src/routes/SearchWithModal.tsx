import { useMatch } from "react-router";
import type { MediaKind } from "@mobius/shared";
import { SearchRoute } from "./SearchRoute";
import { TitleRoute } from "./TitleRoute";

function isKind(value: string | undefined): value is MediaKind {
  return value === "movie" || value === "tv";
}

export function SearchWithModal() {
  const titleMatch = useMatch("/search/title/:kind/:id");
  const rawKind = titleMatch?.params.kind;
  const rawId = titleMatch?.params.id;
  const id = rawId ? Number(rawId) : null;
  const showModal = isKind(rawKind) && id != null && Number.isFinite(id);

  return (
    <>
      <SearchRoute />
      {showModal && rawKind && id != null && (
        <TitleRoute kind={rawKind as MediaKind} id={id} />
      )}
    </>
  );
}
