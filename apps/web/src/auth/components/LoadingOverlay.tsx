import type { CSSProperties } from "react";

type Props = {
  caption?: string;
  sub?: string;
  style?: CSSProperties;
};

export function LoadingOverlay({
  caption = "Threading the loop",
  sub = "AUTHENTICATING · GOOGLE OAUTH 2.0",
  style,
}: Props) {
  return (
    <div className="loadingOverlay" style={style}>
      <div className="loadingOverlay__pearl" />
      <div className="loadingOverlay__cap">{caption}</div>
      <div className="loadingOverlay__sub">{sub}</div>
    </div>
  );
}
