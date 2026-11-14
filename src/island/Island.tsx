import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { Cover } from "./Cover.tsx";
import type { IslandContact, IslandNotice, IslandPhoto, LiveState } from "./desk.ts";
import { Dock } from "./Dock.tsx";
import { PeekView } from "./peeks.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { GeminiView, RadioView } from "./panels.tsx";
import type { Compact, Frame, PeekId, View } from "./types.ts";
import type { useMusic } from "./useActivities.ts";
import type { useBrightness } from "./useBrightness.ts";
import type { useGemini } from "./useGemini.ts";
import type { useRadio } from "./useRadio.ts";
import { CompactFace, HomeView, MusicView } from "./views.tsx";

type Music = ReturnType<typeof useMusic>;
type Radio = ReturnType<typeof useRadio>;
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
  gemini,
  brightness,
  deviceHere,
  onToggleDevice,
  onOpen,
  onPeek,
  onMoon,
  onClose,
  onMusic,
  onRadio,
  live,
  celsius,
  photos,
  contacts,
  notices,
  contactsSupported,
  mailCount,
  eventTitle,
  onAddPhotos,
  onPickContacts,
  onDisconnect,
}: {
  view: View;
  peek: PeekId;
  dim: boolean;
  compact: Compact;
  frame: Frame;
  now: Date;
  music: Music;
  radio: Radio;
  gemini: Gemini;
  brightness: Brightness;
  deviceHere: boolean;
  onToggleDevice: () => void;
  onOpen: (view: View) => void;
  onPeek: (id: PeekId) => void;
  onMoon: () => void;
  onClose: () => void;
  onMusic: () => void;
  onRadio: () => void;
  live: LiveState;
  celsius: number | null;
  photos: IslandPhoto[];
  contacts: IslandContact[];
  notices: IslandNotice[];
  contactsSupported: boolean;
  mailCount: number;
  eventTitle: string;
  onAddPhotos: (files: FileList | null) => void;
  onPickContacts: () => void;
  onDisconnect: () => void;
}) {
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
        geminiLine={gemini.lastReply ? gemini.lastReply.slice(0, 42) : "In this island"}
        onMusic={onMusic}
        onGemini={() => onOpen("gemini")}
        onRadio={onRadio}
      />
    );
  } else if (view === "music") {
    stage = (
      <MusicView music={music} deviceHere={deviceHere} onToggleDevice={onToggleDevice} />
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
        notices={notices}
        contactsSupported={contactsSupported}
        brightness={brightness}
        onBrightness={brightness.set}
        onAddPhotos={onAddPhotos}
        onPickContacts={onPickContacts}
        onDisconnect={onDisconnect}
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
              <StatusBar now={now} onClose={onClose} celsius={celsius} />
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
