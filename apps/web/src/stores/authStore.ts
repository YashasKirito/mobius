import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { create } from "zustand";
import { auth } from "../lib/firebase";
import { queryClient } from "../lib/queryClient";

export type AuthStatus =
  | "bootstrapping"
  | "idle"
  | "authenticating"
  | "error";

type AuthState = {
  user: User | null;
  status: AuthStatus;
  errorMessage: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  bootstrap: () => () => void;
};

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

function describeAuthError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  switch (code) {
    case "auth/popup-blocked-by-browser":
      return "Pop-up blocked. Allow pop-ups for this site and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in window closed before access was granted. Try once more.";
    case "auth/network-request-failed":
      return "Network error reaching Google. Check your connection and try again.";
    case "auth/unauthorized-domain":
      return "This domain isn't authorised in your Firebase project's Auth settings.";
    default:
      return "We couldn't sign you in. Please try again.";
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: "bootstrapping",
  errorMessage: null,

  signInWithGoogle: async () => {
    set({ status: "authenticating", errorMessage: null });
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.warn("[auth] signInWithGoogle failed", err);
      set({ status: "error", errorMessage: describeAuthError(err) });
    }
  },

  signOut: async () => {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.warn("[auth] signOut failed", err);
    }
    queryClient.clear();
  },

  bootstrap: () =>
    onAuthStateChanged(auth, (user) => {
      set((prev) => ({
        user,
        status: "idle",
        errorMessage: user ? null : prev.errorMessage,
      }));
    }),
}));
