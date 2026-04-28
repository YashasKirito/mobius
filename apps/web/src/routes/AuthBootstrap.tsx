import { useEffect } from "react";
import { Outlet } from "react-router";
import { LoadingOverlay } from "../auth/components/LoadingOverlay";
import { useAuthStore } from "../stores/authStore";

export function AuthBootstrap() {
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => bootstrap(), [bootstrap]);

  if (status === "bootstrapping") {
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

  return <Outlet />;
}
