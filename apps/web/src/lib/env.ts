type FirebaseEnv = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
};

const required = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

function read(name: (typeof required)[number]): string {
  const value = import.meta.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Missing ${name}. Copy apps/web/.env.local.example to apps/web/.env.local and fill in your Firebase web-app config.`,
    );
  }
  return value;
}

export const firebaseEnv: FirebaseEnv = {
  apiKey: read("VITE_FIREBASE_API_KEY"),
  authDomain: read("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: read("VITE_FIREBASE_PROJECT_ID"),
  appId: read("VITE_FIREBASE_APP_ID"),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};
