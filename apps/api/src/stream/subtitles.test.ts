import { describe, expect, it } from "vitest";
import { srtToVtt } from "./subtitles.js";

describe("srtToVtt", () => {
  it("adds the WEBVTT header and converts comma timestamps", () => {
    const srt =
      "1\r\n00:00:01,000 --> 00:00:04,000\r\nHello world\r\n\r\n" +
      "2\r\n00:00:05,500 --> 00:00:07,250\r\nSecond line\r\n";
    const vtt = srtToVtt(srt);
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toContain("00:00:01.000 --> 00:00:04.000");
    expect(vtt).toContain("00:00:05.500 --> 00:00:07.250");
    expect(vtt).not.toContain(",000");
    expect(vtt).toContain("Hello world");
    expect(vtt).toContain("Second line");
  });

  it("strips a leading BOM and normalizes CRLF", () => {
    const srt = "﻿1\r\n00:00:00,000 --> 00:00:02,000\r\nHi\r\n";
    const vtt = srtToVtt(srt);
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).not.toContain("\r");
    expect(vtt).toContain("00:00:00.000 --> 00:00:02.000");
  });

  it("tolerates extra spacing around the arrow", () => {
    const srt = "1\n00:00:01,000  -->  00:00:03,000\nText\n";
    const vtt = srtToVtt(srt);
    expect(vtt).toContain("00:00:01.000 --> 00:00:03.000");
  });
});
