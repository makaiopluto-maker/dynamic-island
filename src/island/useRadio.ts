import { useCallback, useEffect, useRef, useState } from "react";

export const stations = [
  {
    id: "kpop",
    name: "Big B K-Pop",
    detail: "Seoul",
    url: "https://antares.dribbcast.com/proxy/kpop?mp=/s",
  },
  {
    id: "moe",
    name: "Listen.moe",
    detail: "K-Pop",
    url: "https://listen.moe/kpop/stream",
  },
  {
    id: "fred",
    name: "Fred Film",
    detail: "한국어",
    url: "https://s10.webradio-hosting.com/proxy/fredradiokr/stream",
  },
  {
    id: "paradise",
    name: "Radio Paradise",
    detail: "Eclectic",
    url: "https://stream.radioparadise.com/mp3-128",
  },
] as const;

export function useRadio() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const indexRef = useRef(0);
  const tunedId = useRef<string | null>(null);

  useEffect(() => {
    const node = new Audio();
    node.preload = "none";
    audio.current = node;
    const onPlaying = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onError = () => {
      setPlaying(false);
      setFailed(true);
    };
    node.addEventListener("playing", onPlaying);
    node.addEventListener("pause", onPause);
    node.addEventListener("error", onError);
    return () => {
      node.pause();
      node.removeEventListener("playing", onPlaying);
      node.removeEventListener("pause", onPause);
      node.removeEventListener("error", onError);
      audio.current = null;
    };
  }, []);

  const tune = useCallback((nextIndex: number, shouldPlay: boolean) => {
    const next = (nextIndex + stations.length) % stations.length;
    const station = stations[next];
    const node = audio.current;
    indexRef.current = next;
    setIndex(next);
    setFailed(false);
    if (!node) return;
    if (tunedId.current !== station.id) {
      tunedId.current = station.id;
      node.src = station.url;
      node.load();
    }
    if (!shouldPlay) {
      node.pause();
      return;
    }
    void node.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "NotAllowedError") return;
      setPlaying(false);
      setFailed(true);
    });
  }, []);

  const play = useCallback(() => tune(indexRef.current, true), [tune]);
  const stop = useCallback(() => {
    audio.current?.pause();
    setPlaying(false);
  }, []);
  const toggle = useCallback(() => {
    if (audio.current && !audio.current.paused) stop();
    else play();
  }, [play, stop]);
  const next = useCallback(() => tune(indexRef.current + 1, true), [tune]);
  const prev = useCallback(() => tune(indexRef.current - 1, true), [tune]);
  const choose = useCallback((id: string) => {
    const found = stations.findIndex((station) => station.id === id);
    if (found >= 0) tune(found, true);
  }, [tune]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !playing) return;
    const station = stations[index];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist: station.detail,
      album: "Dynamic Island Radio",
    });
    navigator.mediaSession.playbackState = "playing";
    try {
      navigator.mediaSession.setActionHandler("play", () => tune(indexRef.current, true));
      navigator.mediaSession.setActionHandler("pause", () => audio.current?.pause());
      navigator.mediaSession.setActionHandler("nexttrack", () => tune(indexRef.current + 1, true));
      navigator.mediaSession.setActionHandler("previoustrack", () => tune(indexRef.current - 1, true));
    } catch {
      /* This browser does not expose media keys. */
    }
  }, [playing, index, tune]);

  return { station: stations[index], stations, index, playing, failed, play, stop, toggle, next, prev, choose };
}
