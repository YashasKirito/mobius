import { useAuthStore } from "../../stores/authStore";
import { GoogleButton } from "./GoogleButton";
import { LegalLine } from "./LegalLine";
import { LoadingOverlay } from "./LoadingOverlay";
import { MobiusLoop } from "./MobiusLoop";
import { AlertIcon } from "./Glyphs";

export function MobileLogin() {
  const status = useAuthStore((s) => s.status);
  const errorMessage = useAuthStore((s) => s.errorMessage);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  const isLoading = status === "authenticating";
  const isError = status === "error";

  return (
    <div className="mob login-root">
      <div className="mob__bg">
        <img src="/assets/media/echoes-wide.svg" alt="" />
      </div>
      <div className="mob__aurora" />
      <div className="mob__grain" />
      <div className="mob__vignette" />

      <div className="mob__inner">
        <div className="mob__brand">
          <MobiusLoop size={32} />
          <span className="word">Møbius</span>
        </div>
        <div className="mob__heroSpacer" />

        {isLoading ? (
          <LoadingOverlay
            sub="AUTHENTICATING"
            style={{ padding: "40px 0" }}
          />
        ) : (
          <>
            <div className="mob__hero">
              <span className="mob__eyebrow">— Sign In</span>
              <h1 className="mob__head">
                Stories, in their <em>natural</em> element.
              </h1>
              <p className="mob__sub">
                Sign in with Google to continue. There are no passwords on
                Møbius.
              </p>
            </div>

            {isError && errorMessage && (
              <div className="mob__error" role="alert">
                <AlertIcon />
                <div>
                  <strong>Couldn't sign you in. </strong>
                  {errorMessage}
                </div>
              </div>
            )}

            <div className="mob__actions">
              <GoogleButton
                onClick={() => {
                  void signInWithGoogle();
                }}
                label={isError ? "Try Google again" : "Continue with Google"}
              />
              <LegalLine />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
