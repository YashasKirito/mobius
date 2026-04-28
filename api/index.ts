// Vercel serverless entry. Wraps the Express app from apps/api as a single
// catch-all function. The vercel.json rewrite sends every /api/* request here
// and Express handles its own sub-routing.

import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "../apps/api/src/app.js";

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}
