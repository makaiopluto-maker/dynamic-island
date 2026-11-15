import { useCallback, useEffect, useRef, useState } from "react";
import { searchCatalog, videoFromLink } from "../../shared/youtube.ts";

export type YtTrack = { id: string; title: string; artist: string };
export type YtPlaylist = { id: string; title: string; count: number };

type YtPlayer = {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getIframe?: () => HTMLIFrameElement;
  destroy: () => void;
};

type PlayerCtor = new (
  element: HTMLElement,
  options: {
    width: string;
    height: string;
    videoId?: string;
    playerVars: Record<string, string | number>;
    events: {
      onReady: () => void;
      onStateChange: (event: { data: number }) => void;
      onError: () => void;
    };
  },
) => YtPlayer;

declare global {
  interface Window {
    YT?: { Player: PlayerCtor; PlayerState: { ENDED: number; PLAYING: number; PAUSED: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiReady: Promise<void> | null = null;

function loadPlayerApi() {
  if (window.YT?.Player) return Promise.resolve();
  apiReady ??= new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    if (!document.querySelector("script[data-youtube-iframe]")) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.dataset.youtubeIframe = "1";
      document.head.appendChild(script);
    }
  });
  return apiReady;
}

export function useYouTube(connected: boolean) {
  const [tracks, setTracks] = useState<YtTrack[]>([]);
  const [playlists, setPlaylists] = useState<YtPlaylist[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<"reconnect" | "unreachable" | "blocked" | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const playerRef = useRef<YtPlayer | null>(null);
  const tracksRef = useRef(tracks);
  const indexRef = useRef(index);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    tracksRef.current = tracks;
    indexRef.current = index;
  });

  const playId = useCallback((id: string) => {
    const player = playerRef.current;
    if (!player) {
      pendingRef.current = id;
      return;
    }
    player.loadVideoById(id);
    const frame = player.getIframe?.();
    if (frame && !frame.src.includes(`/embed/${id}`)) {
      const origin = encodeURIComponent(window.location.origin);
      frame.allow = "autoplay; encrypted-media; picture-in-picture";
      frame.src = `https://www.youtube.com/embed/${id}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1&origin=${origin}`;
    }
  }, []);

  const next = useCallback(() => {
    const list = tracksRef.current;
    if (!list.length) return;
    const upcoming = (indexRef.current + 1) % list.length;
    indexRef.current = upcoming;
    setIndex(upcoming);
    setPosition(0);
    const id = list[upcoming]?.id;
    if (id) playId(id);
  }, [playId]);

  const prev = useCallback(() => {
    const player = playerRef.current;
    if ((player?.getCurrentTime() ?? 0) > 3) {
      player?.seekTo(0, true);
      setPosition(0);
      return;
    }
    const list = tracksRef.current;
    if (!list.length) return;
    const upcoming = (indexRef.current - 1 + list.length) % list.length;
    indexRef.current = upcoming;
    setIndex(upcoming);
    setPosition(0);
    const id = list[upcoming]?.id;
    if (id) playId(id);
  }, [playId]);

  useEffect(() => {
    if (!host) return;
    let dead = false;
    let player: YtPlayer | null = null;
    const mount = document.createElement("div");
    host.appendChild(mount);
    void loadPlayerApi().then(() => {
      if (dead || !window.YT?.Player) return;
      const videoId = pendingRef.current ?? tracksRef.current[indexRef.current]?.id;
      player = new window.YT.Player(mount, {
        width: "100%",
        height: "100%",
        videoId: videoId ?? undefined,
        playerVars: {
          autoplay: videoId ? 1 : 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (dead) return;
            playerRef.current = player;
            const queued = pendingRef.current;
            if (queued) {
              pendingRef.current = null;
              player?.loadVideoById(queued);
            }
          },
          onError: () => {
            if (!dead) {
              setPlaying(false);
              setError("blocked");
            }
          },
          onStateChange: (event) => {
            if (dead) return;
            const state = window.YT?.PlayerState;
            if (event.data === state?.PLAYING) setPlaying(true);
            if (event.data === state?.PAUSED) setPlaying(false);
            if (event.data === state?.ENDED) next();
          },
        },
      });
    });
    return () => {
      dead = true;
      playerRef.current = null;
      setPlaying(false);
      try {
        player?.destroy();
      } catch {
        mount.remove();
      }
    };
  }, [host, next]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      setPosition(player.getCurrentTime() || 0);
      const length = player.getDuration() || 0;
      if (length > 0) setDuration(length);
    }, 500);
    return () => window.clearInterval(id);
  }, [playing]);

  useEffect(() => {
    let stop = false;
    void searchCatalog("popular songs").then((found) => {
      if (stop || !found.length) return;
      setTracks((current) => (current.length ? current : found));
    });
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (!connected) return;
    let stop = false;
    void fetch("/api/youtube/library")
      .then(async (response) => {
        const body = (await response.json()) as { playlists?: YtPlaylist[]; tracks?: YtTrack[]; error?: string };
        if (stop) return;
        if (body.error === "reconnect") setError("reconnect");
        else if (body.error) setError("unreachable");
        setPlaylists(body.playlists ?? []);
        if (body.tracks?.length) {
          setTracks(body.tracks);
          setIndex(0);
        }
      })
      .catch(() => {
        if (!stop) setError("unreachable");
      });
    return () => {
      stop = true;
    };
  }, [connected]);

  useEffect(() => {
    if (!playing || !("mediaSession" in navigator)) return;
    const track = tracks[index];
    if (!track) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: "YouTube Music",
    });
    navigator.mediaSession.playbackState = "playing";
    try {
      navigator.mediaSession.setActionHandler("play", () => playerRef.current?.playVideo());
      navigator.mediaSession.setActionHandler("pause", () => playerRef.current?.pauseVideo());
      navigator.mediaSession.setActionHandler("nexttrack", next);
      navigator.mediaSession.setActionHandler("previoustrack", prev);
    } catch {
      /* This browser does not expose media keys. */
    }
  }, [index, next, playing, prev, tracks]);

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo();
    setPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    const player = playerRef.current;
    const track = tracksRef.current[indexRef.current];
    if (!track) return;
    const state = player?.getPlayerState();
    if (state === window.YT?.PlayerState.PLAYING) player?.pauseVideo();
    else if (state === window.YT?.PlayerState.PAUSED) player?.playVideo();
    else playId(track.id);
  }, [playId]);

  const seek = useCallback((value: number) => {
    playerRef.current?.seekTo(value, true);
    setPosition(value);
  }, []);

  const playAt = useCallback(
    (at: number) => {
      const track = tracksRef.current[at];
      if (!track) return;
      indexRef.current = at;
      setIndex(at);
      setPosition(0);
      playId(track.id);
    },
    [playId],
  );

  const showTracks = useCallback(
    (list: YtTrack[]) => {
      tracksRef.current = list;
      indexRef.current = 0;
      setTracks(list);
      setIndex(0);
      setPosition(0);
      setDuration(0);
      const id = list[0]?.id;
      if (id) playId(id);
    },
    [playId],
  );

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setError(null);
    const linked = videoFromLink(q);
    if (linked) {
      showTracks([{ id: linked, title: "YouTube Music", artist: "Link" }]);
      return;
    }
    try {
      if (connected) {
        const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`);
        if (response.ok) {
          const body = (await response.json()) as { tracks?: YtTrack[] };
          if (body.tracks?.length) {
            showTracks(body.tracks);
            return;
          }
        }
      }
      const found = await searchCatalog(q);
      if (!found.length) setError("unreachable");
      else showTracks(found);
    } catch {
      setError("unreachable");
    }
  }, [connected, query, showTracks]);

  const openPlaylist = useCallback(async (id: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/youtube/playlist?id=${encodeURIComponent(id)}`);
      const body = (await response.json()) as { tracks?: YtTrack[]; error?: string };
      if (body.error === "reconnect") setError("reconnect");
      else if (body.error) setError("unreachable");
      else {
        setTracks(body.tracks ?? []);
        setIndex(0);
        setPosition(0);
        setDuration(0);
      }
    } catch {
      setError("unreachable");
    }
  }, []);

  return {
    attach: setHost,
    tracks,
    playlists,
    index,
    track: tracks[index] ?? null,
    playing,
    position,
    duration,
    query,
    setQuery,
    error,
    toggle,
    pause,
    next,
    prev,
    seek,
    playAt,
    search,
    openPlaylist,
  };
}
