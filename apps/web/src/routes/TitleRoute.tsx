import { useNavigate } from "react-router";
import type { MediaKind } from "@mobius/shared";
import { useTitle } from "../queries/catalog";
import { DetailModal } from "../streaming/components/DetailModal";

type Props = { kind: MediaKind; id: number };

export function TitleRoute({ kind, id }: Props) {
  const navigate = useNavigate();
  const { data: item, isPending, isError } = useTitle(kind, id);

  if (isPending) return null;

  if (isError || !item) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(5,6,13,0.85)",
          color: "var(--dm-fg-1)",
          fontFamily: "var(--dm-font-display)",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>Title not found.</div>
        <button
          type="button"
          className="dm-btn dm-btn--glass"
          onClick={() => navigate("/", { replace: true })}
        >
          Back to home
        </button>
      </div>
    );
  }

  return (
    <DetailModal
      item={item}
      onClose={() => navigate(-1)}
      onPlay={(target) => navigate(`/watch/${target.kind}/${target.id}`)}
    />
  );
}
