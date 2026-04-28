import { useMatch } from "react-router";
import { HomeRoute } from "./HomeRoute";
import { TitleRoute } from "./TitleRoute";
import type { MediaKind } from "@mobius/shared";

function isKind(value: string | undefined): value is MediaKind {
  return value === "movie" || value === "tv";
}

export function HomeWithModal() {
  const titleMatch = useMatch("/title/:kind/:id");
  const rawKind = titleMatch?.params.kind;
  const rawId = titleMatch?.params.id;
  const id = rawId ? Number(rawId) : null;
  const showModal = isKind(rawKind) && id != null && Number.isFinite(id);

  return (
    <>
      <HomeRoute />
      {showModal && rawKind && id != null && (
        <TitleRoute kind={rawKind as MediaKind} id={id} />
      )}
    </>
  );
}
