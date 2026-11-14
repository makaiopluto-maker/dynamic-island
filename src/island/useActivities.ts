import { useCallback, useEffect, useRef, useState } from "react";
import { tracks } from "./data.ts";

export function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export function useViewport() {
  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

export function useMusic() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const indexRef = useRef(0);
  const positionRef = useRef(0);

  useEffect(() => {
    indexRef.current = index;
    positionRef.current = position;
  });

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const duration = tracks[indexRef.current].duration;
      const next = positionRef.current + 0.25;
      if (next >= duration) {
        const upcoming = (indexRef.current + 1) % tracks.length;
        indexRef.current = upcoming;
        positionRef.current = 0;
        setIndex(upcoming);
        setPosition(0);
        return;
      }
      positionRef.current = next;
      setPosition(next);
    }, 250);
    return () => window.clearInterval(id);
  }, [playing]);

  const toggle = useCallback(() => setPlaying((value) => !value), []);
  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const next = useCallback(() => {
    const upcoming = (indexRef.current + 1) % tracks.length;
    indexRef.current = upcoming;
    positionRef.current = 0;
    setIndex(upcoming);
    setPosition(0);
  }, []);
  const prev = useCallback(() => {
    if (positionRef.current > 3) {
      positionRef.current = 0;
      setPosition(0);
      return;
    }
    const upcoming = (indexRef.current - 1 + tracks.length) % tracks.length;
    indexRef.current = upcoming;
    positionRef.current = 0;
    setIndex(upcoming);
    setPosition(0);
  }, []);
  const seek = useCallback((value: number) => {
    const duration = tracks[indexRef.current].duration;
    const nextPosition = Math.min(Math.max(0, value), duration - 0.05);
    positionRef.current = nextPosition;
    setPosition(nextPosition);
  }, []);

  useEffect(() => {
    if (!playing || !("mediaSession" in navigator)) return;
    const track = tracks[index];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: "Dynamic Island",
    });
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    try {
      navigator.mediaSession.setActionHandler("play", () => setPlaying(true));
      navigator.mediaSession.setActionHandler("pause", () => setPlaying(false));
      navigator.mediaSession.setActionHandler("nexttrack", next);
      navigator.mediaSession.setActionHandler("previoustrack", prev);
    } catch {
      /* This browser does not expose media keys. */
    }
  }, [index, playing, next, prev]);

  return {
    track: tracks[index],
    playing,
    position,
    toggle,
    play,
    pause,
    next,
    prev,
    seek,
  };
}

