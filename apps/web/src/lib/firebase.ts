import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from "firebase/auth";
import { firebaseEnv } from "./env";

const app = initializeApp(firebaseEnv);

export const auth = getAuth(app);

void setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("[firebase] Failed to set local persistence", err);
});
