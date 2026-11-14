import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type Hls from "hls.js";
import { channels, dial } from "../../shared/radio.mjs";

const SAVED_KEY = "island-radio-saved";

export type Station = {
  id: string;
  name: string;
  detail: string;
  url?: string;
  mhz?: number;
  live?: boolean;
  saved?: boolean;
};

function builtIn(): Station[] {
  return [
    ...dial.map((station) => ({
      id: station.id,
      name: station.name,
      detail: station.detail,
      mhz: station.mhz,
      live: true,
    })),
    ...channels.map((station) => ({
      id: station.id,
      name: station.name,
      detail: station.detail,
      url: station.url,
    })),
  ];
}

function loadSaved(): Station[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as { id?: unknown; name?: unknown; detail?: unknown; url?: unknown };
      if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.url !== "string") return [];
      if (!row.url.startsWith("https://") || row.name.length > 80) return [];
      return [{ id: row.id, name: row.name, detail: typeof row.detail === "string" ? row.detail : "Saved", url: row.url, saved: true }];
    }).slice(0, 24);
  } catch {
    return [];
  }
}

function isHls(url: string) {
  return /\.m3u8(\?|$)/i.test(url);
}

export function useRadio() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const tunedId = useRef<string | null>(null);
  const ticket = useRef(0);
  const resolved = useRef(new Map<string, { url: string; at: number }>());
  const [saved, setSaved] = useState<Station[]>(loadSaved);
  const stations = useMemo(() => [...builtIn(), ...saved], [saved]);
  const stationsRef = useRef(stations);
  const [index, setIndex] = useState(0);
  const [mhz, setMhz] = useState(89.1);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tuning, setTuning] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);

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
      hlsRef.current?.destroy();
      hlsRef.current = null;
      node.pause();
      node.removeEventListener("playing", onPlaying);
      node.removeEventListener("pause", onPause);
      node.removeEventListener("error", onError);
      audio.current = null;
    };
  }, []);

  const attach = useCallback(async (node: HTMLAudioElement, url: string) => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (isHls(url)) {
      const { default: Hls } = await import("hls.js");
      if (Hls.isSupported()) {
        node.removeAttribute("src");
        const hls = new Hls({ enableWorker: false, maxBufferLength: 20 });
        hlsRef.current = hls;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setPlaying(false);
            setFailed(true);
          }
        });
        hls.loadSource(url);
        hls.attachMedia(node);
        return;
      }
    }
    node.src = url;
    node.load();
  }, []);

  const tune = useCallback(async (nextIndex: number, shouldPlay: boolean) => {
    const list = stationsRef.current;
    if (!list.length) return;
    const next = (nextIndex + list.length) % list.length;
    const station = list[next];
    const node = audio.current;
    const mine = ++ticket.current;
    indexRef.current = next;
    setIndex(next);
    setFailed(false);
    if (station.mhz) setMhz(station.mhz);
    if (!node) return;
    if (!shouldPlay) {
      node.pause();
      return;
    }
    let url = station.url ?? "";
    if (station.live) {
      const cached = resolved.current.get(station.id);
      if (cached && Date.now() - cached.at < 60_000) url = cached.url;
      else {
        setTuning(true);
        try {
          const response = await fetch(`/api/radio/tune?id=${encodeURIComponent(station.id)}`);
          const body = (await response.json()) as { url?: string };
          if (!response.ok || !body.url?.startsWith("https://")) throw new Error("tune");
          url = body.url;
          resolved.current.set(station.id, { url, at: Date.now() });
        } catch {
          if (mine === ticket.current) {
            setTuning(false);
            setFailed(true);
            setPlaying(false);
          }
          return;
        }
      }
    }
    if (mine !== ticket.current || !url) return;
    setTuning(false);
    if (tunedId.current !== `${station.id}:${url}`) {
      tunedId.current = `${station.id}:${url}`;
      await attach(node, url);
    }
    if (mine !== ticket.current) return;
    void node.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "NotAllowedError") return;
      setPlaying(false);
      setFailed(true);
    });
  }, [attach]);

  const play = useCallback(() => void tune(indexRef.current, true), [tune]);
  const stop = useCallback(() => {
    audio.current?.pause();
    setPlaying(false);
  }, []);
  const toggle = useCallback(() => {
    if (audio.current && !audio.current.paused) stop();
    else play();
  }, [play, stop]);
  const next = useCallback(() => void tune(indexRef.current + 1, true), [tune]);
  const prev = useCallback(() => void tune(indexRef.current - 1, true), [tune]);
  const choose = useCallback((id: string) => {
    const found = stationsRef.current.findIndex((station) => station.id === id);
    if (found >= 0) void tune(found, true);
  }, [tune]);
  const tuneMhz = useCallback((value: number) => {
    const fm = stationsRef.current.filter((station) => station.mhz != null);
    const nearest = fm.reduce((best, station) => {
      if (!best || Math.abs((station.mhz ?? 0) - value) < Math.abs((best.mhz ?? 0) - value)) return station;
      return best;
    }, null as Station | null);
    if (!nearest) return;
    setMhz(nearest.mhz ?? value);
    if (stationsRef.current[indexRef.current]?.id !== nearest.id) choose(nearest.id);
  }, [choose]);

  const save = useCallback((station: Station) => {
    if (!station.url?.startsWith("https://")) return;
    const current = stationsRef.current.filter((item) => item.saved);
    const next = current.some((item) => item.id === station.id)
      ? current
      : [...current, { ...station, saved: true }].slice(-24);
    localStorage.setItem(SAVED_KEY, JSON.stringify(next.map(({ id, name, detail, url }) => ({ id, name, detail, url }))));
    const list = [...builtIn(), ...next];
    stationsRef.current = list;
    setSaved(next);
    const found = list.findIndex((item) => item.id === station.id);
    if (found >= 0) void tune(found, true);
  }, [tune]);

  const forget = useCallback((id: string) => {
    setSaved((current) => {
      const next = current.filter((station) => station.id !== id);
      localStorage.setItem(SAVED_KEY, JSON.stringify(next.map(({ id: savedId, name, detail, url }) => ({ id: savedId, name, detail, url }))));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator) || !playing) return;
    const station = stations[index];
    if (!station) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist: station.mhz ? `${station.mhz.toFixed(1)} MHz` : station.detail,
      album: "Dynamic Island Radio",
    });
    navigator.mediaSession.playbackState = "playing";
    try {
      navigator.mediaSession.setActionHandler("play", () => void tune(indexRef.current, true));
      navigator.mediaSession.setActionHandler("pause", () => audio.current?.pause());
      navigator.mediaSession.setActionHandler("nexttrack", () => void tune(indexRef.current + 1, true));
      navigator.mediaSession.setActionHandler("previoustrack", () => void tune(indexRef.current - 1, true));
    } catch {
      /* This browser does not expose media keys. */
    }
  }, [playing, index, stations, tune]);

  return {
    station: stations[index] ?? stations[0],
    stations,
    index,
    mhz,
    playing,
    failed,
    tuning,
    play,
    stop,
    toggle,
    next,
    prev,
    choose,
    tuneMhz,
    save,
    forget,
  };
}
