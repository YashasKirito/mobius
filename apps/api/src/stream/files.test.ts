import { describe, expect, it } from "vitest";
import { pickVideoFile, type TorrentFile } from "./files.js";

const MB = 1024 * 1024;

describe("pickVideoFile — movie", () => {
  it("picks the largest video file, ignoring samples and non-video", () => {
    const files: TorrentFile[] = [
      { index: 0, path: "Dune.2021.1080p/Dune.mkv", length: 4000 * MB },
      { index: 1, path: "Dune.2021.1080p/sample.mkv", length: 40 * MB },
      { index: 2, path: "Dune.2021.1080p/readme.txt", length: 1 * MB },
    ];
    expect(pickVideoFile(files)?.index).toBe(0);
  });

  it("returns null when there is no video file", () => {
    const files: TorrentFile[] = [
      { index: 0, path: "readme.txt", length: 1 * MB },
    ];
    expect(pickVideoFile(files)).toBeNull();
  });
});

describe("pickVideoFile — tv season pack", () => {
  const pack: TorrentFile[] = [
    {
      index: 0,
      path: "The.Show.S01/The.Show.S01E01.1080p.mkv",
      length: 1500 * MB,
    },
    {
      index: 1,
      path: "The.Show.S01/The.Show.S01E02.1080p.mkv",
      length: 1500 * MB,
    },
    {
      index: 2,
      path: "The.Show.S01/The.Show.S01E03.1080p.mkv",
      length: 1500 * MB,
    },
  ];

  it("selects the requested episode from a pack", () => {
    expect(pickVideoFile(pack, { season: 1, episode: 3 })?.index).toBe(2);
  });

  it("falls back to the largest video file when no episode matches", () => {
    const out = pickVideoFile(pack, { season: 2, episode: 9 });
    expect(out).not.toBeNull();
    expect([0, 1, 2]).toContain(out?.index);
  });
});
