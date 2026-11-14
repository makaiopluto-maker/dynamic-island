import { Cover } from "./Cover.tsx";
import { formatElapsed, formatRemaining } from "./format.ts";
import { AirplayIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./Icons.tsx";
import type { Compact } from "./types.ts";
import type { useMusic } from "./useActivities.ts";
import type { useRadio } from "./useRadio.ts";

type Music = ReturnType<typeof useMusic>;
type Radio = ReturnType<typeof useRadio>;

export function CompactFace({
  compact,
  music,
  radio,
  onOpen,
  onPeek,
  mailCount,
  eventTitle,
}: {
  compact: Compact;
  music: Music;
  radio: Radio;
  onOpen: (target: "home" | "music" | "radio" | "gemini") => void;
  onPeek: (id: "mail" | "calendar") => void;
  mailCount: number;
  eventTitle: string;
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

  if (compact === "radio") {
    return (
      <button type="button" className="compact" onClick={() => onOpen("radio")} aria-label={`Open ${radio.station.name}`}>
        <span className="live-dot" />
        <span className="compact-title">{radio.station.name}</span>
      </button>
    );
  }

  if (compact === "mail") {
    return (
      <button type="button" className="compact" onClick={() => onPeek("mail")} aria-label="Open mail">
        <span className="live-dot mail" />
        <span className="compact-time">{mailCount} new</span>
      </button>
    );
  }

  if (compact === "event") {
    return (
      <button type="button" className="compact" onClick={() => onPeek("calendar")} aria-label="Open calendar">
        <span className="live-dot event" />
        <span className="compact-title">{eventTitle}</span>
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
  radio,
  geminiLine,
  onMusic,
  onGemini,
  onRadio,
}: {
  music: Music;
  radio: Radio;
  geminiLine: string;
  onMusic: () => void;
  onGemini: () => void;
  onRadio: () => void;
}) {
  return (
    <div className="cards">
      <button type="button" className="card card-gemini" onClick={onGemini}>
        <span className="kicker">Gemini</span>
        <span>
          <span className="card-time">Ask</span>
          <span className="card-sub">{geminiLine}</span>
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
      <button type="button" className="card card-radio" onClick={onRadio}>
        <span className="kicker">Radio</span>
        <span>
          <span className="card-title">{radio.station.name}</span>
          <span className="card-sub">{radio.playing ? "Live" : "Ready"}</span>
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


