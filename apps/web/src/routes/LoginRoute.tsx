import { Navigate, useLocation } from "react-router";
import { LoginScreen } from "../auth/LoginScreen";
import { useAuthStore } from "../stores/authStore";

type LocationState = { from?: { pathname: string } } | null;

export function LoginRoute() {
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (user) {
    const state = location.state as LocationState;
    const target = state?.from?.pathname ?? "/";
    return <Navigate to={target} replace />;
  }
  return <LoginScreen />;
}
