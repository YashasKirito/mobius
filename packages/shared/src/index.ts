export type HealthResponse = {
  status: "ok";
  uptime: number;
};

export type HelloResponse = {
  message: string;
};

export * from "./tmdb.js";
export * from "./catalog.js";
