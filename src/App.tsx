import { useEffect, useState, type CSSProperties } from "react";
import { Island } from "./island/Island.tsx";
import { frameFor } from "./island/data.ts";
import { mastHeight } from "./island/format.ts";
import type { Compact, PeekId, View } from "./island/types.ts";
import { useEditing, useFocus, useMusic, useNow, useViewport } from "./island/useActivities.ts";
import { Room } from "./scene/Room.tsx";

export default function App() {
  const viewport = useViewport();
  const now = useNow();
  const music = useMusic();
  const focus = useFocus();
  const [view, setView] = useState<View>("idle");
  const [peek, setPeek] = useState<PeekId>("plus");
  const [dim, setDim] = useState(false);
  const [deviceHere, setDeviceHere] = useState(true);
  const editing = useEditing(view === "claude");

  const compact: Compact = compactFor(focus.running, focus.done, music.playing, editing.live);
  const mast = mastHeight(viewport.h);
  const frame = frameFor(view, compact, viewport.w, viewport.h, mast);

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
      if (event.key === "3") setView("claude");
      if (event.key === "4") setView("focus");
      if (event.key === " ") {
        if (view === "music") {
          event.preventDefault();
          music.toggle();
        } else if (view === "focus") {
          event.preventDefault();
          if (focus.running) focus.pause();
          else focus.start();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, music, focus]);

  const openMusic = () => {
    music.play();
    setView("music");
  };

  return (
    <div
      className={dim ? "screen dim" : "screen"}
      style={{ "--mast": `${mast}px` } as CSSProperties}
      onClick={() => setView("idle")}
    >
      <header className="mast">
        <h1>
          <span>Dynamic Island</span>
          <span className="for">for Windows</span>
        </h1>
      </header>
      <div className="room">
        <Room />
        <div className="room-shade" />
      </div>
      {view === "idle" ? <p className="hint">Click the island</p> : null}
      <div className="island-slot">
        <Island
          view={view}
          peek={peek}
          dim={dim}
          compact={compact}
          frame={frame}
          now={now}
          music={music}
          focus={focus}
          editing={editing}
          deviceHere={deviceHere}
          onToggleDevice={() => setDeviceHere((value) => !value)}
          onOpen={setView}
          onPeek={(id) => {
            setPeek(id);
            setView("peek");
          }}
          onMoon={() => {
            setDim((value) => !value);
            setPeek("moon");
            setView("peek");
          }}
          onClose={() => setView("idle")}
          onMusic={openMusic}
        />
      </div>
      <p className="keys">Esc closes · 1 Home · 2 Music · 3 Claude · 4 Focus</p>
      <p className="sr-only" aria-live="polite">
        {view === "idle" ? "Dynamic Island closed" : `Dynamic Island showing ${view}`}
      </p>
    </div>
  );
}

function compactFor(focusRunning: boolean, focusDone: boolean, musicPlaying: boolean, editing: boolean): Compact {
  if (focusRunning || focusDone) return "focus";
  if (musicPlaying) return "music";
  if (editing) return "claude";
  return "eyes";
}
