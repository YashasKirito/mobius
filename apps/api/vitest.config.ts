import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Satisfy the app env loader for modules that transitively import it.
    env: { TMDB_READ_ACCESS_TOKEN: "test-token" },
  },
});
