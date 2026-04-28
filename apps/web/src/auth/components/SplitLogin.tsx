import { useMemo } from "react";
import { useLoginBackdrops } from "../../queries/loginArt";
import { useAuthStore } from "../../stores/authStore";
import { GoogleButton } from "./GoogleButton";
import { LegalLine } from "./LegalLine";
import { LoadingOverlay } from "./LoadingOverlay";
import { MobiusLoop } from "./MobiusLoop";
import { AlertIcon, ShieldIcon } from "./Glyphs";

const STRIP_COUNT = 4;
const STRIP_VARIANTS = ["", " splitA__strip--rev", " splitA__strip--alt", " splitA__strip--rev"];

export function SplitLogin() {
  const status = useAuthStore((s) => s.status);
  const errorMessage = useAuthStore((s) => s.errorMessage);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const wides = useLoginBackdrops();

  const strips = useMemo(() => {
    if (wides.length < STRIP_COUNT * 2) {
      // Not enough unique posters to give each strip its own — fall back to the
      // original repeat pattern so the reel still looks full.
      const reversed = [...wides].reverse();
      const rotated = [...wides.slice(2), ...wides.slice(0, 2)];
      return [
        [...wides, ...wides],
        [...reversed, ...reversed],
        [...rotated, ...rotated],
        [...reversed, ...reversed],
      ];
    }
    // Disjoint chunks — no poster appears in two strips. Each chunk is then
    // doubled in place so the CSS `translateX(-50%)` animation loops seamlessly.
    const size = Math.floor(wides.length / STRIP_COUNT);
    return Array.from({ length: STRIP_COUNT }, (_, i) => {
      const start = i * size;
      const end = i === STRIP_COUNT - 1 ? wides.length : start + size;
      const slice = wides.slice(start, end);
      return [...slice, ...slice];
    });
  }, [wides]);

  const isLoading = status === "authenticating";
  const isError = status === "error";

  return (
    <div className="splitA login-root">
      <div className="splitA__left">
        <div
          className="splitA__reel"
          style={isLoading ? { filter: "blur(2px) brightness(0.7)" } : undefined}
        >
          {strips.map((items, stripIdx) => (
            <div
              key={stripIdx}
              className={`splitA__strip${STRIP_VARIANTS[stripIdx] ?? ""}`}
            >
              {items.map((src, i) => (
                <div key={`${stripIdx}-${i}`} className="splitA__poster">
                  <img src={src} alt="" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="splitA__veil" />
        <div className="splitA__leftMark">
          <MobiusLoop size={36} />
          <span className="word">Møbius</span>
        </div>
        <div className="splitA__leftCopy">
          <span className="splitA__eyebrow">— Now Streaming</span>
          <h1 className="splitA__head">
            Stories, in their <em>natural</em> element.
          </h1>
          <p className="splitA__sub">
            A loop you never leave. Films, series, and live broadcasts —
            colour-graded for the dark, paced for the patient.
          </p>
          <div className="splitA__credits">
            <span>4K · DOLBY VISION</span>
            <span className="dot" />
            <span>ATMOS</span>
            <span className="dot" />
            <span>2,400+ TITLES</span>
          </div>
        </div>
      </div>

      <div className="splitA__right">
        <div className="splitA__rightGrain" />
        {isLoading ? (
          <LoadingOverlay style={{ width: "100%", maxWidth: 380 }} />
        ) : (
          <div className="splitA__form">
            <div className="splitA__formHead">
              <span className="splitA__eyebrow">Sign In</span>
              <h2 className="splitA__greet">
                <em>Welcome</em> back.
              </h2>
              <p className="splitA__greetSub">
                Pick up where you left off. Sign in to continue — there are no
                passwords here, only Google.
              </p>
            </div>

            {isError && errorMessage && (
              <div className="splitA__errorChip" role="alert">
                <AlertIcon />
                <div>
                  <strong>We couldn't sign you in.</strong> {errorMessage}
                </div>
              </div>
            )}

            <GoogleButton
              onClick={() => {
                void signInWithGoogle();
              }}
              label={isError ? "Try Google again" : "Continue with Google"}
            />

            <div className="splitA__divider">Google only</div>

            <div className="splitA__only">
              <div className="splitA__onlyTitle">
                <ShieldIcon />
                Why Google-only?
              </div>
              <p className="splitA__onlyDesc">
                Fewer passwords, fewer attack surfaces. Møbius never stores
                credentials — your Google account is the only key.
              </p>
            </div>

            <LegalLine />
          </div>
        )}

        <div className="splitA__foot">
          <div className="trust-row">
            <ShieldIcon />
            Encrypted · OAuth 2.0
          </div>
          <div className="legal">
            <a>Need help?</a>
          </div>
        </div>
      </div>
    </div>
  );
}
