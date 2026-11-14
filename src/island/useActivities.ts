import { useCallback, useEffect, useRef, useState } from "react";
import { snippets, tracks } from "./data.ts";
import type { ClaudeTab } from "./types.ts";

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

  return {
    track: tracks[index],
    playing,
    position,
    toggle,
    play,
    next,
    prev,
    seek,
  };
}

export function useFocus() {
  const [duration, setDuration] = useState(25 * 60);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const remainingRef = useRef(25 * 60);
  const durationRef = useRef(25 * 60);

  useEffect(() => {
    remainingRef.current = remaining;
    durationRef.current = duration;
  });

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const next = remainingRef.current - 1;
      if (next <= 0) {
        remainingRef.current = 0;
        setRemaining(0);
        setRunning(false);
        setDone(true);
        return;
      }
      remainingRef.current = next;
      setRemaining(next);
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const start = useCallback(() => {
    const next = remainingRef.current <= 0 ? durationRef.current : remainingRef.current;
    remainingRef.current = next;
    setRemaining(next);
    setDone(false);
    setRunning(true);
  }, []);

  const pause = useCallback(() => setRunning(false), []);

  const choose = useCallback((minutes: number) => {
    const next = Math.min(60, Math.max(1, minutes)) * 60;
    durationRef.current = next;
    remainingRef.current = next;
    setRunning(false);
    setDuration(next);
    setRemaining(next);
    setDone(false);
  }, []);

  return { duration, remaining, running, done, start, pause, choose };
}

export function useEditing(active: boolean) {
  const [seconds, setSeconds] = useState(0);
  const [live, setLive] = useState(false);
  const [tab, setTab] = useState<ClaudeTab>("edit");
  const [snippet, setSnippet] = useState(0);

  if (active && !live) setLive(true);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [live]);

  useEffect(() => {
    if (!active || tab !== "edit") return;
    const id = window.setInterval(() => {
      setSnippet((value) => (value + 1) % snippets.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [active, tab]);

  return { seconds, live, tab, setTab, snippet };
}
