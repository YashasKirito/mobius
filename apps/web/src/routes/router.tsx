import { createBrowserRouter, Navigate } from "react-router";
import { AuthBootstrap } from "./AuthBootstrap";
import { ErrorBoundary } from "./ErrorBoundary";
import { HomeWithModal } from "./HomeWithModal";
import { LoginRoute } from "./LoginRoute";
import { ProtectedLayout } from "./ProtectedLayout";
import { RootLayout } from "./RootLayout";
import { SearchWithModal } from "./SearchWithModal";
import { WatchRoute } from "./WatchRoute";

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        element: <AuthBootstrap />,
        children: [
          { path: "/login", element: <LoginRoute /> },
          {
            element: <ProtectedLayout />,
            children: [
              { path: "/", element: <HomeWithModal /> },
              { path: "/title/:kind/:id", element: <HomeWithModal /> },
              { path: "/search", element: <SearchWithModal /> },
              { path: "/search/title/:kind/:id", element: <SearchWithModal /> },
              { path: "/watch/:kind/:id", element: <WatchRoute /> },
            ],
          },
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);
