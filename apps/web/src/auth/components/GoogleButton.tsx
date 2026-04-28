import { GMark } from "./GMark";

type Props = {
  loading?: boolean;
  onClick?: () => void;
  label?: string;
};

export function GoogleButton({
  loading = false,
  onClick,
  label = "Continue with Google",
}: Props) {
  if (loading) {
    return (
      <button type="button" className="g-btn" disabled>
        <div className="g-spinner" />
        <span className="g-label">Signing you in…</span>
      </button>
    );
  }
  return (
    <button type="button" className="g-btn" onClick={onClick}>
      <GMark />
      <span className="g-label">{label}</span>
    </button>
  );
}
