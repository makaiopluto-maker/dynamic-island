import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Cover } from "./Cover.tsx";
import type { IslandContact, IslandPhoto, LiveState, useWeather } from "./desk.ts";
import { Dock } from "./Dock.tsx";
import { PeekView } from "./peeks.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { GeminiView, RadioView } from "./panels.tsx";
import type { Compact, Frame, PeekId, View } from "./types.ts";
import type { useMusic } from "./useActivities.ts";
import type { useBrightness } from "./useBrightness.ts";
import type { useGemini } from "./useGemini.ts";
import type { useRadio } from "./useRadio.ts";
import type { MusicSource, useSpotify } from "./useSpotify.ts";
import type { useYouTube } from "./useYouTube.ts";
import { CompactFace, HomeView, MusicView } from "./views.tsx";

type Music = ReturnType<typeof useMusic>;
type Radio = ReturnType<typeof useRadio>;
type YouTube = ReturnType<typeof useYouTube>;
type Spotify = ReturnType<typeof useSpotify>;
type Gemini = ReturnType<typeof useGemini>;
type Brightness = ReturnType<typeof useBrightness>;

export function Island({
  view,
  peek,
  dim,
  compact,
  frame,
  now,
  music,
  radio,
  youtube,
  spotify,
  source,
  onSource,
  gemini,
  brightness,
  onOpen,
  onPeek,
  onMoon,
  onClose,
  onMusic,
  onRadio,
  live,
  weather,
  photos,
  contacts,
  contactsSupported,
  mailCount,
  eventTitle,
  onAddPhotos,
  onPickContacts,
  onDisconnect,
  onRefresh,
}: {
  view: View;
  peek: PeekId;
  dim: boolean;
  compact: Compact;
  frame: Frame;
  now: Date;
  music: Music;
  radio: Radio;
  youtube: YouTube;
  spotify: Spotify;
  source: MusicSource;
  onSource: (source: MusicSource) => void;
  gemini: Gemini;
  brightness: Brightness;
  onOpen: (view: View) => void;
  onPeek: (id: PeekId) => void;
  onMoon: () => void;
  onClose: () => void;
  onMusic: () => void;
  onRadio: () => void;
  live: LiveState;
  weather: ReturnType<typeof useWeather>;
  photos: IslandPhoto[];
  contacts: IslandContact[];
  contactsSupported: boolean;
  mailCount: number;
  eventTitle: string;
  onAddPhotos: (files: FileList | null) => void;
  onPickContacts: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const reduce = useReducedMotion() ?? false;
  const spring = reduce
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 360, damping: 34, mass: 0.82 };
  const contentKey = view === "idle" ? `idle-${compact}` : view === "peek" ? `peek-${peek}` : view;

  let stage: ReactNode = null;
  if (view === "idle") {
    stage = (
      <CompactFace
        compact={compact}
        music={music}
        radio={radio}
        youtube={youtube}
        spotify={spotify}
        source={source}
        onOpen={onOpen}
        onPeek={onPeek}
        mailCount={mailCount}
        eventTitle={eventTitle}
      />
    );
  } else if (view === "home") {
    stage = (
      <HomeView
        music={music}
        radio={radio}
        youtube={youtube}
        spotify={spotify}
        source={source}
        geminiLine={
          gemini.lastReply
            ? gemini.lastReply.slice(0, 42)
            : gemini.configured
              ? "무엇이든 물어보세요"
              : "키를 저장하세요"
        }
        onMusic={onMusic}
        onGemini={() => onOpen("gemini")}
        onRadio={onRadio}
      />
    );
  } else if (view === "music") {
    stage = (
      <MusicView youtube={youtube} spotify={spotify} source={source} onSource={onSource} live={live} />
    );
  } else if (view === "gemini") {
    stage = <GeminiView gemini={gemini} />;
  } else if (view === "radio") {
    stage = <RadioView radio={radio} />;
  } else {
    stage = (
      <PeekView
        id={peek}
        now={now}
        live={live}
        photos={photos}
        contacts={contacts}
        contactsSupported={contactsSupported}
        weather={weather}
        brightness={brightness}
        onBrightness={brightness.set}
        onAddPhotos={onAddPhotos}
        onPickContacts={onPickContacts}
        onDisconnect={onDisconnect}
        onRefresh={onRefresh}
        geminiReady={gemini.configured}
      />
    );
  }

  return (
    <motion.section
      className="island"
      data-view={view}
      data-compact={view === "idle" ? compact : undefined}
      aria-label="Dynamic Island"
      initial={false}
      animate={{ width: frame.width, height: frame.height, borderRadius: frame.radius }}
      transition={spring}
      onClick={(event) => event.stopPropagation()}
      style={{ "--glow": glowFor(view, compact) } as CSSProperties}
    >
      <div className="glow" />
      <AnimatePresence initial={false}>
        <motion.div
          key={contentKey}
          className="body"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.16 }}
        >
          {view === "idle" ? (
            stage
          ) : (
            <>
              {view === "music" ? (
                <AnimatePresence initial={false}>
                  <motion.div
                    key={music.track.theme}
                    className="bleed"
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.35 }}
                  >
                    <Cover theme={music.track.theme} />
                  </motion.div>
                </AnimatePresence>
              ) : null}
              <StatusBar
                now={now}
                onClose={onClose}
                menuOpen={menu}
                onMenu={() => setMenu((open) => !open)}
                celsius={weather.current?.celsius ?? null}
              />
              {menu ? (
                <div className="more-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); onSource("youtube"); onOpen("music"); }}>
                    YouTube Music
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); onSource("spotify"); onOpen("music"); }}>
                    Spotify
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); onOpen("gemini"); }}>
                    Gemini
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); onOpen("radio"); }}>
                    Radio
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); onPeek("plus"); }}>
                    Settings
                  </button>
                </div>
              ) : null}
              <div className="stage">{stage}</div>
              <Dock view={view} peek={peek} dim={dim} onOpen={onOpen} onPeek={onPeek} onMoon={onMoon} />
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.section>
  );
}

function glowFor(view: View, compact: Compact) {
  if (view === "gemini") return "110, 150, 255";
  if (view === "radio" || (view === "idle" && compact === "radio")) return "255, 150, 80";
  if (view === "music" || (view === "idle" && compact === "music")) return "255, 122, 96";
  if (view === "idle" && compact === "mail") return "255, 140, 90";
  if (view === "idle" && compact === "event") return "120, 186, 255";
  if (view === "home") return "255, 176, 122";
  if (view === "peek") return "255, 196, 150";
  return "255, 255, 255";
}
