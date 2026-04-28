import { LRUCache } from "lru-cache";
import { env } from "../env.js";
import { logger } from "./logger.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const store = new LRUCache<string, {}>({ max: 1000 });

export const TTL = {
  configuration: 24 * 60 * 60 * 1000,
  genres: 6 * 60 * 60 * 1000,
  list: 30 * 60 * 1000,
  detail: 6 * 60 * 60 * 1000,
  search: 5 * 60 * 1000,
  catalogHome: 15 * 60 * 1000,
} as const;

export async function cached<T extends object>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key) as T | undefined;
  if (hit !== undefined) {
    if (env.IS_DEV) logger.debug({ key }, "cache hit");
    return hit;
  }
  if (env.IS_DEV) logger.debug({ key }, "cache miss");
  const value = await fetcher();
  store.set(key, value, { ttl: ttlMs });
  return value;
}

export function clearCache() {
  store.clear();
}
