import type { PointerEvent } from "react";
import { Cover } from "./Cover.tsx";
import { snippets } from "./data.ts";
import { formatClock, formatDoneAt, formatElapsed, formatRemaining, seoulFace } from "./format.ts";
import { AirplayIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./Icons.tsx";
import type { ClaudeTab, Compact, PeekId } from "./types.ts";
import type { useFocus, useMusic } from "./useActivities.ts";

type Music = ReturnType<typeof useMusic>;
type Focus = ReturnType<typeof useFocus>;

export function CompactFace({
  compact,
  music,
  focus,
  editingSeconds,
  onOpen,
}: {
  compact: Compact;
  music: Music;
  focus: Focus;
  editingSeconds: number;
  onOpen: (target: "home" | "music" | "focus" | "claude") => void;
}) {
  if (compact === "music") {
    const progress = Math.min(100, (music.position / music.track.duration) * 100);
    return (
      <button type="button" className="compact" onClick={() => onOpen("music")} aria-label={`Open ${music.track.title}`}>
        <span className="mini-disc">
          <Cover theme={music.track.theme} />
        </span>
        <span className="bars" aria-hidden="true">
          <i /><i /><i /><i />
        </span>
        <span className="compact-title">{music.track.title}</span>
        <span className="compact-progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </span>
      </button>
    );
  }

  if (compact === "focus") {
    return (
      <button type="button" className="compact" onClick={() => onOpen("focus")} aria-label="Open focus timer">
        <span className="live-dot" />
        <span className="compact-time">{focus.done ? "Done" : formatClock(focus.remaining)}</span>
      </button>
    );
  }

  if (compact === "claude") {
    return (
      <button type="button" className="compact" onClick={() => onOpen("claude")} aria-label="Open Claude">
        <span className="mini-lamps" aria-hidden="true"><i /><i /></span>
        <span className="compact-time">{formatClock(editingSeconds)}</span>
      </button>
    );
  }

  return (
    <button type="button" className="eyes" onClick={() => onOpen("home")} aria-label="Open Dynamic Island">
      <span className="eye" />
      <span className="eye" />
    </button>
  );
}

export function HomeView({
  music,
  focus,
  editingSeconds,
  onMusic,
  onClaude,
  onFocus,
}: {
  music: Music;
  focus: Focus;
  editingSeconds: number;
  onMusic: () => void;
  onClaude: () => void;
  onFocus: () => void;
}) {
  const focusLabel = focus.running ? "In session" : focus.done ? "Complete" : "Ready";
  return (
    <div className="cards">
      <button type="button" className="card card-claude" onClick={onClaude}>
        <span className="kicker">Claude</span>
        <span>
          <span className="card-time">{formatClock(editingSeconds)}</span>
          <span className="card-sub">Editing</span>
        </span>
      </button>
      <button type="button" className="card card-music" onClick={onMusic}>
        <Cover theme={music.track.theme} />
        <span className="play-orb" aria-hidden="true">
          {music.playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
        </span>
        <span className="card-copy">
          <span className="card-title">{music.track.title}</span>
          <span className="card-artist">{music.track.artist}</span>
        </span>
      </button>
      <button type="button" className="card card-focus" onClick={onFocus}>
        <span className="kicker">Focus</span>
        <span>
          <span className="card-time">{formatClock(focus.remaining)}</span>
          <span className="subrow">
            <span className="card-sub">{focusLabel}</span>
            <span className="mini-play" aria-hidden="true">
              <PlayIcon size={9} />
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}

export function MusicView({ music, deviceHere, onToggleDevice }: {
  music: Music;
  deviceHere: boolean;
  onToggleDevice: () => void;
}) {
  const progress = (music.position / music.track.duration) * 100;
  return (
    <div className="music-stage">
      <div className="music-copy">
        <p className="music-meta">
          {music.track.title} · {music.track.artist}
        </p>
        <p className="lyric">{music.track.lyrics[0]}</p>
        <p className="lyric soft">{music.track.lyrics[1]}</p>
      </div>
      <div className="transport">
        <button
          type="button"
          className="orb"
          onClick={music.toggle}
          aria-label={music.playing ? "Pause" : "Play"}
          aria-pressed={music.playing}
        >
          {music.playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        <span className="elapsed">{formatElapsed(music.position)}</span>
        <input
          className="scrub"
          type="range"
          min={0}
          max={music.track.duration}
          step={0.25}
          value={Math.min(music.position, music.track.duration)}
          aria-label="Playback position"
          style={{ ["--p" as string]: `${progress}%` }}
          onChange={(event) => music.seek(Number(event.target.value))}
        />
        <span className="remain">{formatRemaining(music.track.duration - music.position)}</span>
      </div>
      <div className="skiprow">
        <button type="button" className="icon-btn" onClick={music.prev} aria-label="Previous">
          <PrevIcon />
        </button>
        <button
          type="button"
          className="icon-btn main"
          onClick={music.toggle}
          aria-label={music.playing ? "Pause" : "Play"}
        >
          {music.playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
        </button>
        <button type="button" className="icon-btn" onClick={music.next} aria-label="Next">
          <NextIcon />
        </button>
        <button
          type="button"
          className={`icon-btn air${deviceHere ? " on" : ""}`}
          onClick={onToggleDevice}
          aria-pressed={deviceHere}
          aria-label={deviceHere ? "Playing in this window" : "Play in this window"}
        >
          <AirplayIcon />
        </button>
      </div>
    </div>
  );
}

const checks = [
  "Glass samples the room behind it",
  "The spring settles without a fight",
  "Dock targets stay easy to hit",
];

export function ClaudeView({
  seconds,
  tab,
  snippetIndex,
  onTab,
}: {
  seconds: number;
  tab: ClaudeTab;
  snippetIndex: number;
  onTab: (tab: ClaudeTab) => void;
}) {
  const snippet = snippets[snippetIndex] ?? snippets[0];
  const tabs: { id: ClaudeTab; label: string }[] = [
    { id: "read", label: "Read" },
    { id: "edit", label: "Edit" },
    { id: "test", label: "Test" },
    { id: "done", label: "Done" },
  ];

  return (
    <div className="claude">
      <div className="claude-side">
        <div className="lamps" aria-hidden="true">
          <span />
          <span />
        </div>
        <div>
          <div className="claude-time">{formatClock(seconds)}</div>
          <div className="claude-state">Editing</div>
        </div>
      </div>
      <div className="diff-card">
        <div className="diff-title">{snippet.title}</div>
        <div className="diff-meta">
          <span>{snippet.file}</span>
          <span>
            <em className="add-count">+{snippet.add}</em> <em className="del-count">−{snippet.del}</em>
          </span>
        </div>
        {tab === "edit" ? (
          <div className="diff-lines" key={snippet.title}>
            {snippet.lines.map((line) => (
              <span key={line.text} className={line.kind === "add" ? "kind-add" : "kind-del"}>
                {line.text}
              </span>
            ))}
          </div>
        ) : null}
        {tab === "read" ? (
          <div className="diff-lines">
            <span className="kind-ctx">{"// what the glass keeps"}</span>
            {snippet.lines
              .filter((line) => line.kind === "add")
              .map((line) => (
                <span key={line.text} className="kind-ctx">
                  {line.text}
                </span>
              ))}
          </div>
        ) : null}
        {tab === "test" ? (
          <ul className="checks">
            {checks.map((check) => (
              <li key={check}>{check}</li>
            ))}
          </ul>
        ) : null}
        {tab === "done" ? (
          <div className="landed">
            <span aria-hidden="true">✓</span>
            <p>Landed. The island is glassy.</p>
          </div>
        ) : null}
      </div>
      <div className="tabs" role="tablist" aria-label="Claude">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FocusView({ focus, now }: { focus: Focus; now: Date }) {
  const minutes = focus.remaining / 60;
  const left = (minutes / 60) * 100;
  const doneAt = new Date(now.getTime() + focus.remaining * 1000);
  const label = focus.running ? "Pause" : focus.done ? "Again" : "Start";

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    if (focus.running) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const next = Math.round(Math.min(1, Math.max(0, ratio)) * 60);
    focus.choose(next === 0 ? 1 : next);
  };

  return (
    <div className="focus">
      <div className="focus-top">
        <div>
          <div className={`focus-time${focus.done ? " done" : ""}`}>{formatClock(focus.remaining)}</div>
          <div className="focus-sub">{focus.done ? "Session complete" : `Done at ${formatDoneAt(doneAt)}`}</div>
        </div>
        <button
          type="button"
          className="start"
          onClick={() => (focus.running ? focus.pause() : focus.start())}
        >
          {label}
        </button>
      </div>
      <div
        className="ruler"
        role="slider"
        tabIndex={0}
        aria-valuemin={1}
        aria-valuemax={60}
        aria-valuenow={Math.max(1, Math.round(minutes))}
        aria-valuetext={`${Math.max(1, Math.round(minutes))} minutes`}
        aria-label="Focus length"
        aria-disabled={focus.running}
        onPointerDown={pick}
        onKeyDown={(event) => {
          if (focus.running) return;
          const current = Math.max(1, Math.round(minutes));
          if (event.key === "ArrowRight") {
            event.preventDefault();
            focus.choose(Math.min(60, current + 1));
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            focus.choose(Math.max(1, current - 1));
          }
        }}
      >
        <div className="ticks" aria-hidden="true">
          {Array.from({ length: 61 }, (_, index) => (
            <span key={index} className={index % 10 === 0 ? "major" : index % 5 === 0 ? "mid" : ""} />
          ))}
        </div>
        <div className="playhead" style={{ left: `${left}%` }} />
        <div className="ruler-labels" aria-hidden="true">
          {[0, 10, 20, 30, 40, 50, 60].map((mark) => (
            <span key={mark}>{mark}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PeekView({ id, dim, now }: { id: PeekId; dim: boolean; now: Date }) {
  const face = seoulFace(now);
  const copy = {
    plus: {
      title: "Four live activities",
      body: "Home, Music, Claude, and Focus stay on the island. Everything else keeps quiet.",
    },
    messages: { title: "Messages", body: "Nothing new. The island stays quiet." },
    moon: {
      title: dim ? "Lights down" : "Lights up",
      body: dim ? "The room is dim. The glass keeps its glow." : "Daylight is back across the glass.",
    },
    phone: { title: "Phone", body: "No missed calls." },
    photos: { title: "North window", body: "Last light, kept in the glass." },
    calendar: { title: face.longDate, body: "The day is open." },
    mail: { title: "Mail", body: "Inbox zero. Leave it that way." },
  }[id];

  return (
    <div className="peek">
      {id === "photos" ? (
        <div className="peek-photo">
          <Cover theme="gold" />
        </div>
      ) : null}
      <div>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
    </div>
  );
}
