// Vercel serverless entry. Wraps the Express app from apps/api as a single
// catch-all function. The vercel.json rewrite sends every /api/* request here
// and Express handles its own sub-routing.

import type { IncomingMessage, ServerResponse } from "node:http";

let appPromise: Promise<(req: IncomingMessage, res: ServerResponse) => void> | null = null;
let initError: Error | null = null;

function loadApp() {
  if (!appPromise) {
    appPromise = import("../apps/api/src/app.js")
      .then((m) => m.createApp() as (req: IncomingMessage, res: ServerResponse) => void)
      .catch((err: Error) => {
        initError = err;
        throw err;
      });
  }
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await loadApp();
    return app(req, res);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "unknown error";
    const stack = err instanceof Error ? err.stack : undefined;
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "function_init_failed",
        message,
        stack: process.env.VERCEL_ENV === "production" ? undefined : stack,
        priorInitError: initError?.message,
      }),
    );
  }
}
