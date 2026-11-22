import type { Compact, CoverTheme, Frame, PeekId, View } from "./types.ts";

export type Track = {
  title: string;
  artist: string;
  duration: number;
  theme: CoverTheme;
  lyrics: [string, string];
};

export const tracks: Track[] = [
  {
    title: "Blue Hours",
    artist: "Tide Club",
    duration: 195,
    theme: "day",
    lyrics: ["Hold the window, let the blue in", "The tide is pulling at the glass"],
  },
  {
    title: "Golden Hour",
    artist: "Nova Lane",
    duration: 175,
    theme: "gold",
    lyrics: ["Windows down, the city's glowing", "Every streetlight turning gold"],
  },
  {
    title: "Afterimage",
    artist: "Low Room",
    duration: 168,
    theme: "dusk",
    lyrics: ["Leave the lamp on when you go", "The island keeps a little glow"],
  },
];

export type DiffLine = { kind: "del" | "add"; text: string };

export type Snippet = {
  title: string;
  file: string;
  add: number;
  del: number;
  lines: DiffLine[];
};

export const snippets: Snippet[] = [
  {
    title: "Make the island glassy",
    file: "GLASS-UI.JS",
    add: 1,
    del: 1,
    lines: [
      { kind: "del", text: "const total = 0" },
      { kind: "add", text: "const total = sum(items)" },
    ],
  },
  {
    title: "Let the room tint the glass",
    file: "GLASS-UI.JS",
    add: 1,
    del: 1,
    lines: [
      { kind: "del", text: "glow = 0.45" },
      { kind: "add", text: "glow = quiet ? 0.45 : 1" },
    ],
  },
  {
    title: "Ease the spring on open",
    file: "ISLAND.TS",
    add: 1,
    del: 1,
    lines: [
      { kind: "del", text: "stiffness: 520" },
      { kind: "add", text: "stiffness: 280, damping: 28" },
    ],
  },
];

export function frameFor(
  view: View,
  compact: Compact,
  viewportWidth: number,
  viewportHeight: number,
  mast: number,
  peek: PeekId,
  youtube = false,
): Frame {
  const wide = Math.min(760, viewportWidth - 24);
  const narrow = viewportWidth < 720;
  const avail = Math.max(220, viewportHeight - mast - 16);
  const fit = (height: number, radius: number): Frame => ({
    width: wide,
    height: Math.min(height, avail),
    radius,
  });

  if (view === "idle") {
    if (compact === "music") return { width: Math.min(236, wide), height: 44, radius: 22 };
    if (compact === "event") return { width: Math.min(220, wide), height: 44, radius: 22 };
    if (compact === "mail") return { width: Math.min(132, wide), height: 44, radius: 22 };
    if (compact === "radio") return { width: Math.min(220, wide), height: 44, radius: 22 };
    return { width: 126, height: 40, radius: 22 };
  }
  if (view === "peek") {
    if (peek === "moon") return fit(narrow ? 320 : 260, 30);
    const tall = peek === "mail" || peek === "calendar" || peek === "photos" || peek === "weather" || peek === "plus";
    if (!tall) return fit(narrow ? 220 : 188, 30);
    return fit(narrow ? 560 : 460, 30);
  }
  if (view === "home") return fit(narrow ? 508 : 292, narrow ? 28 : 36);
  if (view === "music") return fit(youtube ? (narrow ? 680 : 500) : narrow ? 520 : 360, 36);
  if (view === "gemini") return fit(narrow ? 520 : 420, 36);
  if (view === "radio") return fit(narrow ? 640 : 560, 36);
  return fit(narrow ? 312 : 280, 36);
}
