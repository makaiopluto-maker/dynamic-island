import { useEffect, useState, type CSSProperties } from "react";
import { contactsSupported, soonEvent, useContacts, useLive, usePhotos, useWeather } from "./island/desk.ts";
import { Island } from "./island/Island.tsx";
import { frameFor } from "./island/data.ts";
import { mastHeight } from "./island/format.ts";
import type { Compact, PeekId, View } from "./island/types.ts";
import { useMusic, useNow, useViewport } from "./island/useActivities.ts";
import { useBrightness } from "./island/useBrightness.ts";
import { useOpenClaw } from "./island/useOpenClaw.ts";
import { useRadio } from "./island/useRadio.ts";
import { useMusicSource, useSpotify } from "./island/useSpotify.ts";
import { useYouTube } from "./island/useYouTube.ts";
import { ReleaseNotice } from "./island/ReleaseNotice.tsx";
import { Room } from "./scene/Room.tsx";

export default function App() {
  const viewport = useViewport();
  const now = useNow();
  const music = useMusic();
  const radio = useRadio();
  const { live, disconnect, reload } = useLive();
  const youtube = useYouTube(live.connected);
  const spotify = useSpotify();
  const { source, setSource } = useMusicSource();
  const brightness = useBrightness();
  const [opened] = useState(() => new URLSearchParams(window.location.search).get("open"));
  const overlay = new URLSearchParams(window.location.search).get("overlay") === "1";
  const [view, setView] = useState<View>(() => (opened === "mail" ? "peek" : "idle"));
  const [peek, setPeek] = useState<PeekId>(() => (opened === "mail" ? "mail" : "plus"));
  const gemini = useOpenClaw();
  const weather = useWeather();
  const { photos, add: addPhotos } = usePhotos();
  const { contacts, pick: pickContacts } = useContacts();
  const unread = live.mail.source === "google" ? live.mail.messages.filter((message) => message.unread).length : 0;
  const upcoming = live.calendar.source === "google" ? soonEvent(live.calendar.events, now) : null;

  const musicPlaying = source === "spotify" ? spotify.playing : youtube.playing || music.playing;
  const compact: Compact = compactFor(radio.playing, musicPlaying, unread, upcoming?.title ?? "");
  const dim = brightness.level != null && brightness.level <= 30;
  const mast = overlay ? 16 : mastHeight(viewport.h);
  const frame = frameFor(view, compact, viewport.w, viewport.h, mast, peek, true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("open") && !params.has("google")) return;
    params.delete("open");
    params.delete("google");
    const next = params.toString();
    window.history.replaceState({}, "", next ? `/?${next}` : "/");
  }, [opened]);

  useEffect(() => {
    if (!overlay) return;
    const api = window.islandDesktop;
    if (!api) return;
    let interactive = false;
    const update = (event: MouseEvent) => {
      const next = overIsland(event.clientX, event.clientY);
      if (next === interactive) return;
      interactive = next;
      api.setInteractive(next);
    };
    window.addEventListener("mousemove", update);
    return () => window.removeEventListener("mousemove", update);
  }, [overlay]);

  useEffect(() => {
    if (!overlay) return;
    const onBlur = () => setView("idle");
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [overlay]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (event.key === "Escape") {
        setView((current) => (current === "home" || current === "idle" ? "idle" : "home"));
        return;
      }
      if (event.key === "1") setView("home");
      if (event.key === "2") setView("music");
      if (event.key === "3") setView("gemini");
      if (event.key === "4") setView("radio");
      if (event.key === " ") {
        if (view === "music") {
          event.preventDefault();
          radio.stop();
          if (source === "spotify") {
            music.pause();
            youtube.pause();
            spotify.toggle();
          } else {
            music.pause();
            spotify.pause();
            youtube.toggle();
          }
        } else if (view === "radio") {
          event.preventDefault();
          if (!radio.playing) music.pause();
          radio.toggle();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, source, music, radio, youtube, spotify]);

  useEffect(() => {
    if (!youtube.playing) return;
    music.pause();
    radio.stop();
    spotify.pause();
  }, [youtube.playing, music, radio, spotify]);

  useEffect(() => {
    if (!spotify.playing) return;
    music.pause();
    radio.stop();
    youtube.pause();
  }, [spotify.playing, music, radio, youtube]);

  const openMusic = () => {
    radio.stop();
    if (source === "spotify") {
      music.pause();
      youtube.pause();
    } else {
      music.pause();
      spotify.pause();
    }
    setView("music");
  };

  const openRadio = () => {
    music.pause();
    youtube.pause();
    spotify.pause();
    radio.play();
    setView("radio");
  };

  return (
    <div
      className={overlay ? (dim ? "screen overlay dim" : "screen overlay") : dim ? "screen dim" : "screen"}
      style={{ "--mast": `${mast}px` } as CSSProperties}
      onClick={() => setView("idle")}
    >
      {overlay ? null : (
        <header className="mast">
          <h1>
            <span>Dynamic Island</span>
            <span className="for">for Windows</span>
          </h1>
        </header>
      )}
      {overlay ? null : (
        <div className="room">
          <Room />
          <div className="room-shade" />
        </div>
      )}
      {view === "idle" && !overlay ? <p className="hint">Click the island</p> : null}
      <div className="island-slot">
        <Island
          view={view}
          peek={peek}
          dim={dim}
          compact={compact}
          frame={frame}
          now={now}
          music={music}
          radio={radio}
          youtube={youtube}
          spotify={spotify}
          source={source}
          onSource={(next) => {
            if (next === "spotify") {
              music.pause();
              youtube.pause();
            } else spotify.pause();
            setSource(next);
          }}
          gemini={gemini}
          brightness={brightness}
          onOpen={(next) => {
            if (next === "radio") openRadio();
            else setView(next);
          }}
          onPeek={(id) => {
            setPeek(id);
            setView("peek");
          }}
          onMoon={() => {
            setPeek("moon");
            setView("peek");
          }}
          onClose={() => setView("idle")}
          onMusic={openMusic}
          onRadio={openRadio}
          live={live}
          weather={weather}
          photos={photos}
          contacts={contacts}
          contactsSupported={contactsSupported()}
          mailCount={unread}
          eventTitle={upcoming?.title ?? "Next up"}
          onAddPhotos={(files) => void addPhotos(files)}
          onPickContacts={() => void pickContacts()}
          onDisconnect={() => void disconnect()}
          onRefresh={() => void reload()}
        />
      </div>
      {overlay ? null : <p className="keys">Esc closes · 1 Home · 2 Music · 3 AI · 4 Radio</p>}
      {overlay ? null : <ReleaseNotice />}
      <p className="sr-only" aria-live="polite">
        {view === "idle" ? "Dynamic Island closed" : `Dynamic Island showing ${view}`}
      </p>
    </div>
  );
}

declare global {
  interface Window {
    islandDesktop?: {
      setInteractive: (interactive: boolean) => void;
      connectGoogle?: () => Promise<boolean>;
    };
  }
}

function overIsland(x: number, y: number) {
  for (const node of document.querySelectorAll(".island")) {
    const rect = node.getBoundingClientRect();
    if (x >= rect.left - 16 && x <= rect.right + 16 && y >= rect.top - 12 && y <= rect.bottom + 16) return true;
  }
  return false;
}

function compactFor(radioOn: boolean, musicPlaying: boolean, unread: number, eventTitle: string): Compact {
  if (radioOn) return "radio";
  if (musicPlaying) return "music";
  if (unread > 0) return "mail";
  if (eventTitle) return "event";
  return "eyes";
}
