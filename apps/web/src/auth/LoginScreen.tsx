import { MobileLogin } from "./components/MobileLogin";
import { SplitLogin } from "./components/SplitLogin";
import { useMediaQuery } from "./useMediaQuery";
import "./styles/login.css";

export function LoginScreen() {
  const isMobile = useMediaQuery("(max-width: 720px)");
  return isMobile ? <MobileLogin /> : <SplitLogin />;
}
