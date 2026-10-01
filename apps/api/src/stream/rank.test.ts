import { describe, expect, it } from "vitest";
import { rankSources } from "./rank.js";
import type { Candidate, RankContext } from "./types.js";

const GB = 1024 * 1024 * 1024;

function cand(partial: Partial<Candidate> & { title: string }): Candidate {
  return {
    id: partial.title,
    indexer: "test",
    sizeBytes: 4 * GB,
    seeders: 50,
    leechers: 5,
    magnet: "magnet:?xt=urn:btih:" + partial.title,
    ...partial,
  };
}

const movieCtx: RankContext = {
  kind: "movie",
  year: 2021,
};

describe("rankSources — movies", () => {
  it("rejects zero-seeder releases", () => {
    const out = rankSources(
      [cand({ title: "Dune 2021 1080p WEB-DL x264", seeders: 0 })],
      movieCtx,
    );
    expect(out).toHaveLength(0);
  });

  it("rejects CAM releases", () => {
    const out = rankSources(
      [cand({ title: "Dune 2021 1080p CAM x264" })],
      movieCtx,
    );
    expect(out).toHaveLength(0);
  });

  it("rejects releases outside movie size bounds", () => {
    const tooBig = rankSources(
      [cand({ title: "Dune 2021 2160p BluRay x265", sizeBytes: 60 * GB })],
      movieCtx,
    );
    expect(tooBig).toHaveLength(0);
    const tooSmall = rankSources(
      [cand({ title: "Dune 2021 480p WEB x264", sizeBytes: 0.3 * GB })],
      movieCtx,
    );
    expect(tooSmall).toHaveLength(0);
  });

  it("rejects text-search results whose year is far off", () => {
    const out = rankSources(
      [cand({ title: "Dune 1984 1080p BluRay x264" })],
      movieCtx, // fromImdb: false, year 2021
    );
    expect(out).toHaveLength(0);
  });

  it("keeps a far-off year when the candidate came from an imdb-id search", () => {
    const out = rankSources(
      [cand({ title: "Dune 1984 1080p BluRay x264", trusted: true })],
      movieCtx,
    );
    expect(out).toHaveLength(1);
  });

  it("prefers 1080p x264 WEB-DL over 2160p x265 at equal seeds", () => {
    const out = rankSources(
      [
        cand({ title: "Dune 2021 2160p WEB-DL x265", sizeBytes: 10 * GB }),
        cand({ title: "Dune 2021 1080p WEB-DL x264", sizeBytes: 4 * GB }),
      ],
      movieCtx,
    );
    expect(out[0]?.resolution).toBe("1080p");
    expect(out[0]?.codec).toMatch(/x264|h264/i);
  });

  it("lets a much healthier swarm win over marginally better quality", () => {
    const out = rankSources(
      [
        cand({ title: "Dune 2021 1080p WEB-DL x264", seeders: 2 }),
        cand({ title: "Dune 2021 720p WEB-DL x264", seeders: 5000 }),
      ],
      movieCtx,
    );
    expect(out[0]?.resolution).toBe("720p");
  });

  it("parses fields onto the StreamSource", () => {
    const out = rankSources(
      [cand({ title: "Dune 2021 1080p WEB-DL x264", seeders: 100 })],
      movieCtx,
    );
    expect(out[0]).toMatchObject({
      resolution: "1080p",
      source: expect.stringMatching(/web/i),
      isSeasonPack: false,
    });
    expect(out[0]?.score).toBeGreaterThan(0);
  });

  it("lets a healthy swarm beat a low-seed browser-audio release", () => {
    const out = rankSources(
      [
        cand({
          title: "Dune 2021 1080p WEB-DL x264 AAC",
          seeders: 6,
          id: "aac-lowseed",
        }),
        cand({
          title: "Dune 2021 1080p BluRay x264",
          seeders: 500,
          id: "healthy",
        }),
      ],
      movieCtx,
    );
    expect(out[0]?.id).toBe("healthy");
  });

  it("prefers browser-playable AAC audio over AC3/EAC3 at equal quality", () => {
    const out = rankSources(
      [
        cand({
          title: "Dune 2021 1080p WEB-DL x264 EAC3",
          seeders: 100,
          id: "eac3",
        }),
        cand({
          title: "Dune 2021 1080p WEB-DL x264 AAC",
          seeders: 100,
          id: "aac",
        }),
      ],
      movieCtx,
    );
    expect(out[0]?.audio).toBe("aac");
    expect(out[0]?.browserAudio).toBe(true);
    expect(out[1]?.browserAudio).toBe(false);
  });
});

const tvCtx: RankContext = {
  kind: "tv",
  year: null,
  season: 1,
  episode: 3,
};

describe("rankSources — tv", () => {
  it("keeps the matching single episode", () => {
    const out = rankSources(
      [
        cand({
          title: "The Show S01E03 1080p WEB-DL x264",
          sizeBytes: 1.5 * GB,
        }),
      ],
      tvCtx,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.isSeasonPack).toBe(false);
  });

  it("rejects a different episode", () => {
    const out = rankSources(
      [
        cand({
          title: "The Show S01E05 1080p WEB-DL x264",
          sizeBytes: 1.5 * GB,
        }),
      ],
      tvCtx,
    );
    expect(out).toHaveLength(0);
  });

  it("keeps a season pack for the right season and tags it", () => {
    const out = rankSources(
      [
        cand({
          title: "The Show S01 COMPLETE 1080p WEB-DL x264",
          sizeBytes: 20 * GB,
        }),
      ],
      tvCtx,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.isSeasonPack).toBe(true);
  });

  it("prefers the single episode over the season pack", () => {
    const out = rankSources(
      [
        cand({
          title: "The Show S01 COMPLETE 1080p WEB-DL x264",
          sizeBytes: 20 * GB,
          seeders: 100,
        }),
        cand({
          title: "The Show S01E03 1080p WEB-DL x264",
          sizeBytes: 1.5 * GB,
          seeders: 100,
        }),
      ],
      tvCtx,
    );
    expect(out[0]?.isSeasonPack).toBe(false);
  });
});
