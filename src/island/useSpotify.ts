import { useCallback, useState } from "react";

export const spotifyPicks = [
  { uri: "spotify:playlist:37i9dQZF1DX9tPFwDMOaN1", title: "K-Pop ON!" },
  { uri: "spotify:playlist:37i9dQZF1DX14fiWYoe7Oh", title: "K-Pop Daebak" },
  { uri: "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M", title: "Today's Top Hits" },
  { uri: "spotify:playlist:37i9dQZF1DX4sWSpwq3LiO", title: "Peaceful Piano" },
  { uri: "spotify:playlist:37i9dQZF1DX0XUsuxWHRQd", title: "RapCaviar" },
  { uri: "spotify:playlist:37i9dQZF1DX3rxVfibe1L0", title: "Mood Booster" },
] as const;

const SOURCE_KEY = "island-music-source";

export type MusicSource = "youtube" | "spotify";

export function useMusicSource() {
  const [source, setSourceState] = useState<MusicSource>(() => (localStorage.getItem(SOURCE_KEY) === "spotify" ? "spotify" : "youtube"));
  const setSource = useCallback((next: MusicSource) => {
    localStorage.setItem(SOURCE_KEY, next);
    setSourceState(next);
  }, []);
  return { source, setSource };
}

export function spotifyTarget(value: string) {
  const trimmed = value.trim();
  const uri = trimmed.match(/^spotify:(playlist|album|track|artist|episode|show):([A-Za-z0-9]+)$/);
  if (uri) return { uri: trimmed, title: uri[1][0].toUpperCase() + uri[1].slice(1) };
  try {
    const url = new URL(trimmed);
    if (url.hostname !== "open.spotify.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const kind = parts[0] === "embed" ? parts[1] : parts[0];
    const id = parts[0] === "embed" ? parts[2] : parts[1];
    if (!kind || !id || !/^[A-Za-z0-9]+$/.test(id)) return null;
    if (!["playlist", "album", "track", "artist", "episode", "show"].includes(kind)) return null;
    return { uri: `spotify:${kind}:${id}`, title: kind[0].toUpperCase() + kind.slice(1) };
  } catch {
    return null;
  }
}

export function spotifyEmbed(uri: string) {
  const match = uri.match(/^spotify:(playlist|album|track|artist|episode|show):([A-Za-z0-9]+)$/);
  if (!match) return "";
  return `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0`;
}

export function useSpotify() {
  const [current, setCurrent] = useState<{ uri: string; title: string }>(spotifyPicks[0]);
  const open = useCallback((uri: string, title: string) => setCurrent({ uri, title }), []);
  const toggle = useCallback(() => {
    /* Spotify’s own player handles play and pause. */
  }, []);
  const pause = useCallback(() => {
    /* Spotify’s own player handles play and pause. */
  }, []);
  return { picks: spotifyPicks, current, playing: false, open, toggle, pause };
}
