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
    ...channels.map((station) => ({
      id: station.id,
      name: station.name,
      detail: station.detail,
      url: station.url,
    })),
    ...dial.map((station) => ({
      id: station.id,
      name: station.name,
      detail: station.detail,
      mhz: station.mhz,
      live: true,
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

export function useRadio() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const tunedId = useRef<string | null>(null);
  const ticket = useRef(0);
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
      if (hlsRef.current) return;
      setPlaying(false);
      setFailed(true);
    };
    node.addEventListener("playing", onPlaying);
    node.addEventListener("pause", onPause);
    node.addEventListener("error", onError);
    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
      tunedId.current = null;
      node.pause();
      node.removeEventListener("playing", onPlaying);
      node.removeEventListener("pause", onPause);
      node.removeEventListener("error", onError);
      audio.current = null;
    };
  }, []);

  const playNode = useCallback((node: HTMLAudioElement) => {
    void node.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "NotAllowedError") return;
      setPlaying(false);
      setFailed(true);
    });
  }, []);

  const attachDirect = useCallback((node: HTMLAudioElement, stationId: string, url: string) => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const key = `${stationId}:${url}`;
    if (tunedId.current === key && (node.currentSrc === url || node.src === url)) return;
    tunedId.current = key;
    node.src = url;
    node.load();
  }, []);

  const attachHls = useCallback((node: HTMLAudioElement, stationId: string, url: string) => {
    return new Promise<void>((resolve, reject) => {
      void import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) {
          reject(new Error("hls"));
          return;
        }
        if (hlsRef.current) hlsRef.current.destroy();
        node.removeAttribute("src");
        const hls = new Hls({ enableWorker: false, lowLatencyMode: false, maxBufferLength: 20 });
        hlsRef.current = hls;
        tunedId.current = `${stationId}:${url}`;
        let settled = false;
        const timer = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("hls"));
        }, 8000);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          window.clearTimeout(timer);
          if (settled) return;
          settled = true;
          resolve();
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || settled) return;
          settled = true;
          window.clearTimeout(timer);
          setPlaying(false);
          setFailed(true);
          reject(new Error("hls"));
        });
        hls.loadSource(url);
        hls.attachMedia(node);
      }).catch(reject);
    });
  }, []);

  const tune = useCallback((nextIndex: number, shouldPlay: boolean) => {
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
    if (!station.live && station.url) {
      setTuning(false);
      attachDirect(node, station.id, station.url);
      playNode(node);
      return;
    }
    const url = `/api/radio/live.m3u8?id=${encodeURIComponent(station.id)}`;
    setTuning(true);
    void (async () => {
      try {
        await attachHls(node, station.id, url);
      } catch {
        if (mine === ticket.current) {
          setTuning(false);
          setFailed(true);
          setPlaying(false);
        }
        return;
      }
      if (mine !== ticket.current) return;
      setTuning(false);
      playNode(node);
    })();
  }, [attachDirect, attachHls, playNode]);

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
