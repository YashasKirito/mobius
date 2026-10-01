import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PlaybackMode = "vidcore" | "torrent";

export type SubtitleBackground = "none" | "outline" | "box";

export type SubtitleStyle = {
  size: number; // multiplier applied to the base size (1 = default)
  color: string; // hex text colour
  background: SubtitleBackground; // none / text outline / solid box
  position: number; // vertical placement, % up from the bottom edge
};

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  size: 1,
  color: "#ffffff",
  background: "outline",
  position: 12,
};

type SettingsState = {
  playbackMode: PlaybackMode;
  setPlaybackMode: (mode: PlaybackMode) => void;
  // Preferred subtitle language (ISO 639-1), or null for off. Remembered
  // across titles so the choice sticks.
  subtitleLang: string | null;
  setSubtitleLang: (lang: string | null) => void;
  // Subtitle appearance, remembered across titles.
  subtitleStyle: SubtitleStyle;
  setSubtitleStyle: (patch: Partial<SubtitleStyle>) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      playbackMode: "vidcore",
      setPlaybackMode: (mode) => set({ playbackMode: mode }),
      subtitleLang: null,
      setSubtitleLang: (lang) => set({ subtitleLang: lang }),
      subtitleStyle: DEFAULT_SUBTITLE_STYLE,
      setSubtitleStyle: (patch) =>
        set((s) => ({ subtitleStyle: { ...s.subtitleStyle, ...patch } })),
    }),
    { name: "mobius:settings" },
  ),
);
