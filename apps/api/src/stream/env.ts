export type StreamEnv = {
  jackettUrl: string;
  jackettApiKey: string | undefined;
  torrserverUrl: string;
  torrserverPublicUrl: string;
  opensubtitlesApiKey: string | undefined;
  opensubtitlesUsername: string | undefined;
  opensubtitlesPassword: string | undefined;
  opensubtitlesAppName: string;
};

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

export function resolveStreamEnv(): StreamEnv {
  const jackettUrl = trimTrailingSlash(
    process.env.JACKETT_URL || "http://127.0.0.1:9117",
  );
  const torrserverUrl = trimTrailingSlash(
    process.env.TORRSERVER_URL || "http://127.0.0.1:8090",
  );
  const torrserverPublicUrl = trimTrailingSlash(
    process.env.TORRSERVER_PUBLIC_URL || torrserverUrl,
  );
  const jackettApiKey = process.env.JACKETT_API_KEY || undefined;
  return {
    jackettUrl,
    jackettApiKey,
    torrserverUrl,
    torrserverPublicUrl,
    opensubtitlesApiKey: process.env.OPENSUBTITLES_API_KEY || undefined,
    opensubtitlesUsername: process.env.OPENSUBTITLES_USERNAME || undefined,
    opensubtitlesPassword: process.env.OPENSUBTITLES_PASSWORD || undefined,
    opensubtitlesAppName: process.env.OPENSUBTITLES_APP_NAME || "mobius v0.1",
  };
}

export function isStreamConfigured(env: StreamEnv): boolean {
  return typeof env.jackettApiKey === "string" && env.jackettApiKey.length > 0;
}

export function isSubtitlesConfigured(env: StreamEnv): boolean {
  return (
    typeof env.opensubtitlesApiKey === "string" &&
    env.opensubtitlesApiKey.length > 0
  );
}
