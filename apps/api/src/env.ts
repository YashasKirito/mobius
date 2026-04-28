function required(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Missing required env var ${name}. Copy apps/api/.env.example to apps/api/.env and fill it in.`,
    );
  }
  return value;
}

export const env = {
  TMDB_READ_ACCESS_TOKEN: required("TMDB_READ_ACCESS_TOKEN"),
  PORT: Number(process.env.PORT ?? 3001),
  NODE_ENV: process.env.NODE_ENV ?? "development",
  IS_DEV: (process.env.NODE_ENV ?? "development") !== "production",
};
