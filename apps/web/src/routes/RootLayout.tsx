import { lazy, Suspense } from "react";
import { Outlet } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";

const DevTools =
  import.meta.env.DEV
    ? lazy(() =>
        import("@tanstack/react-query-devtools").then((m) => ({
          default: m.ReactQueryDevtools,
        })),
      )
    : null;

export function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      {DevTools && (
        <Suspense fallback={null}>
          <DevTools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
