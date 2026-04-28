import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import type { HealthResponse, HelloResponse } from "@mobius/shared";
import { httpLogger, logger } from "./lib/logger.js";
import { TmdbError } from "./lib/http.js";
import { catalogRouter } from "./routes/catalog.js";
import { tmdbRouter } from "./routes/tmdb.js";

export function createApp() {
  const app = express();

  app.use(httpLogger);
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    const body: HealthResponse = { status: "ok", uptime: process.uptime() };
    res.json(body);
  });

  app.get("/api/hello", (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name : "world";
    const body: HelloResponse = { message: `Hello, ${name}!` };
    res.json(body);
  });

  app.use("/api/tmdb", tmdbRouter);
  app.use("/api/catalog", catalogRouter);

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof TmdbError) {
      if (err.status === 401 || err.status === 403) {
        logger.error({ err }, "tmdb auth misconfig");
        res.status(500).json({ error: "server_misconfigured" });
        return;
      }
      if (err.status === 404) {
        res.status(404).json({ error: "not_found", upstream: err.upstreamMessage });
        return;
      }
      if (err.status === 429) {
        res.set("Retry-After", "5");
        res
          .status(503)
          .json({ error: "rate_limited", upstream: err.upstreamMessage });
        return;
      }
      logger.warn({ err }, "tmdb upstream error");
      res
        .status(502)
        .json({ error: "upstream_error", upstream: err.upstreamMessage });
      return;
    }
    logger.error({ err }, "unhandled error");
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
