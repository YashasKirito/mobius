import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router";

export function ErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Something broke.";
  const detail =
    isRouteErrorResponse(error)
      ? error.data
      : error instanceof Error
        ? error.message
        : "An unexpected error occurred.";

  console.error("[route] error boundary", error);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--dm-bg)",
        color: "var(--dm-fg-1)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: 32,
        textAlign: "center",
        fontFamily: "var(--dm-font-display)",
      }}
    >
      <div
        style={{
          fontFamily: "'Times New Roman', serif",
          fontStyle: "italic",
          fontSize: 24,
          color: "var(--dm-fg-1)",
        }}
      >
        Møbius
      </div>
      <h1
        style={{
          fontSize: 32,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          margin: 0,
        }}
      >
        {title}
      </h1>
      <p style={{ color: "var(--dm-fg-3)", maxWidth: 420, margin: 0 }}>
        {detail}
      </p>
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
