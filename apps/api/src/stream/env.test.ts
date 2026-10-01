import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveStreamEnv, isStreamConfigured } from "./env.js";

describe("stream env", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.JACKETT_URL;
    delete process.env.JACKETT_API_KEY;
    delete process.env.TORRSERVER_URL;
    delete process.env.TORRSERVER_PUBLIC_URL;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("is unconfigured without an api key", () => {
    const e = resolveStreamEnv();
    expect(e.jackettUrl).toBe("http://127.0.0.1:9117");
    expect(e.torrserverUrl).toBe("http://127.0.0.1:8090");
    expect(e.torrserverPublicUrl).toBe("http://127.0.0.1:8090");
    expect(isStreamConfigured(e)).toBe(false);
  });

  it("is configured with an api key and honors overrides", () => {
    process.env.JACKETT_API_KEY = "abc";
    process.env.JACKETT_URL = "http://box:9117";
    process.env.TORRSERVER_PUBLIC_URL = "http://192.168.1.5:8090";
    const e = resolveStreamEnv();
    expect(e.jackettApiKey).toBe("abc");
    expect(e.jackettUrl).toBe("http://box:9117");
    expect(e.torrserverPublicUrl).toBe("http://192.168.1.5:8090");
    expect(isStreamConfigured(e)).toBe(true);
  });

  it("defaults public url to the internal torrserver url", () => {
    process.env.TORRSERVER_URL = "http://box:8090";
    expect(resolveStreamEnv().torrserverPublicUrl).toBe("http://box:8090");
  });

  it("trims trailing slashes", () => {
    process.env.JACKETT_URL = "http://box:9117/";
    expect(resolveStreamEnv().jackettUrl).toBe("http://box:9117");
  });
});
