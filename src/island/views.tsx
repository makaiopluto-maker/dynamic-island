import { useEffect, useRef, useState } from "react";
import { Cover } from "./Cover.tsx";
import { formatElapsed, formatRemaining } from "./format.ts";
import { AirplayIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./Icons.tsx";
import type { Compact } from "./types.ts";
import type { LiveState } from "./desk.ts";
import type { useMusic } from "./useActivities.ts";
import type { useRadio } from "./useRadio.ts";
import type { MusicSource, useSpotify } from "./useSpotify.ts";
import { spotifyEmbed, spotifyTarget } from "./useSpotify.ts";
import type { useYouTube } from "./useYouTube.ts";

type Music = ReturnType<typeof useMusic>;
type Radio = ReturnType<typeof useRadio>;
type YouTube = ReturnType<typeof useYouTube>;
type Spotify = ReturnType<typeof useSpotify>;

export function CompactFace({
  compact,
  music,
  radio,
  youtube,
  spotify,
  source,
  onOpen,
  onPeek,
  mailCount,
  eventTitle,
}: {
  compact: Compact;
  music: Music;
  radio: Radio;
  youtube: YouTube;
  spotify: Spotify;
  source: MusicSource;
  onOpen: (target: "home" | "music" | "radio" | "gemini") => void;
  onPeek: (id: "mail" | "calendar") => void;
  mailCount: number;
  eventTitle: string;
}) {
  if (compact === "music") {
    const spotifyOn = source === "spotify" && spotify.playing;
    const title = spotifyOn ? spotify.current.title : youtube.playing && youtube.track ? youtube.track.title : music.track.title;
    const position = spotifyOn ? 0 : youtube.playing && youtube.track ? youtube.position : music.position;
    const duration = spotifyOn ? 1 : youtube.playing && youtube.track ? Math.max(youtube.duration, 1) : music.track.duration;
    const progress = Math.min(100, (position / duration) * 100);
    return (
      <button type="button" className="compact" onClick={() => onOpen("music")} aria-label={`Open ${title}`}>
        <span className="mini-disc">
          <Cover theme={music.track.theme} />
        </span>
        <span className="bars" aria-hidden="true">
          <i /><i /><i /><i />
        </span>
        <span className="compact-title">{title}</span>
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
  youtube,
  spotify,
  source,
  geminiLine,
  onMusic,
  onGemini,
  onRadio,
}: {
  music: Music;
  radio: Radio;
  youtube: YouTube;
  spotify: Spotify;
  source: MusicSource;
  geminiLine: string;
  onMusic: () => void;
  onGemini: () => void;
  onRadio: () => void;
}) {
  const title = source === "spotify" ? spotify.current.title : youtube.track?.title ?? music.track.title;
  const artist = source === "spotify" ? "Spotify" : youtube.track?.artist ?? music.track.artist;
  const playing = source === "spotify" ? spotify.playing : youtube.track ? youtube.playing : music.playing;
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
          {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
        </span>
        <span className="card-copy">
          <span className="card-title">{title}</span>
          <span className="card-artist">{artist}</span>
        </span>
      </button>
      <button type="button" className="card card-radio" onClick={onRadio}>
        <span className="kicker">Radio</span>
        <span>
          <span className="card-title">{radio.station.name}</span>
          <span className="card-sub">{radio.station.mhz ? `${radio.station.mhz.toFixed(1)} MHz` : radio.playing ? "Live" : "Ready"}</span>
        </span>
      </button>
    </div>
  );
}

function SourceSwitch({ source, onSource }: { source: MusicSource; onSource: (source: MusicSource) => void }) {
  return (
    <div className="source-switch" role="group" aria-label="Music service">
      <button type="button" aria-pressed={source === "youtube"} onClick={() => onSource("youtube")}>
        YouTube Music
      </button>
      <button type="button" aria-pressed={source === "spotify"} onClick={() => onSource("spotify")}>
        Spotify
      </button>
    </div>
  );
}

export function MusicView({
  music,
  youtube,
  spotify,
  source,
  onSource,
  live,
  deviceHere,
  onToggleDevice,
}: {
  music: Music;
  youtube: YouTube;
  spotify: Spotify;
  source: MusicSource;
  onSource: (source: MusicSource) => void;
  live: LiveState;
  deviceHere: boolean;
  onToggleDevice: () => void;
}) {
  if (source === "spotify") return <SpotifyMusic spotify={spotify} source={source} onSource={onSource} />;
  if (live.connected) return <YouTubeMusic youtube={youtube} source={source} onSource={onSource} />;
  const progress = (music.position / music.track.duration) * 100;
  return (
    <div className="music-stage">
      <SourceSwitch source={source} onSource={onSource} />
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
      {live.googleConfigured ? (
        <a className="link-btn music-connect" href="/api/auth/google">
          Play from YouTube Music
        </a>
      ) : (
        <p className="fine music-connect">Sample, until Google is connected.</p>
      )}
    </div>
  );
}

function YouTubeMusic({
  youtube,
  source,
  onSource,
}: {
  youtube: YouTube;
  source: MusicSource;
  onSource: (source: MusicSource) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const { attach } = youtube;
  useEffect(() => {
    attach(frame.current);
    return () => attach(null);
  }, [attach]);
  const length = Math.max(youtube.duration, 1);
  const progress = (youtube.position / length) * 100;
  return (
    <div className="music-stage yt">
      <SourceSwitch source={source} onSource={onSource} />
      <div className="yt-layout">
        <div className="yt-frame" ref={frame} />
        <div className="yt-side">
          <p className="music-meta">YouTube Music{youtube.track ? ` · ${youtube.track.artist}` : ""}</p>
          <p className="lyric">{youtube.track?.title ?? "Your library"}</p>
          <form
            className="yt-search"
            onSubmit={(event) => {
              event.preventDefault();
              void youtube.search();
            }}
          >
            <input
              value={youtube.query}
              onChange={(event) => youtube.setQuery(event.target.value)}
              placeholder="Search songs"
              aria-label="Search YouTube Music"
            />
            <button type="submit" className="link-btn">
              Search
            </button>
          </form>
          {youtube.error === "reconnect" ? (
            <a className="text-btn" href="/api/auth/google">
              Connect again so YouTube Music can open
            </a>
          ) : youtube.error === "unreachable" ? (
            <p className="fine">YouTube Music did not answer.</p>
          ) : null}
        </div>
      </div>
      {youtube.playlists.length ? (
        <div className="yt-row">
          {youtube.playlists.map((playlist) => (
            <button key={playlist.id} type="button" className="text-btn" onClick={() => void youtube.openPlaylist(playlist.id)}>
              {playlist.title}
            </button>
          ))}
        </div>
      ) : null}
      {youtube.tracks.length ? (
        <div className="yt-row songs">
          {youtube.tracks.map((track, at) => (
            <button
              key={`${track.id}-${at}`}
              type="button"
              className={at === youtube.index ? "text-btn on" : "text-btn"}
              onClick={() => youtube.playAt(at)}
            >
              {track.title}
            </button>
          ))}
        </div>
      ) : (
        <p className="fine">Search YouTube Music, or open a playlist.</p>
      )}
      <div className="transport">
        <button type="button" className="orb" onClick={youtube.toggle} aria-label={youtube.playing ? "Pause" : "Play"} aria-pressed={youtube.playing}>
          {youtube.playing ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
        </button>
        <span className="elapsed">{formatElapsed(youtube.position)}</span>
        <input
          className="scrub"
          type="range"
          min={0}
          max={length}
          step={0.25}
          value={Math.min(youtube.position, length)}
          aria-label="Playback position"
          style={{ ["--p" as string]: `${progress}%` }}
          onChange={(event) => youtube.seek(Number(event.target.value))}
        />
        <span className="remain">{formatRemaining(Math.max(0, youtube.duration - youtube.position))}</span>
      </div>
      <div className="skiprow">
        <button type="button" className="icon-btn" onClick={youtube.prev} aria-label="Previous">
          <PrevIcon />
        </button>
        <button type="button" className="icon-btn main" onClick={youtube.toggle} aria-label={youtube.playing ? "Pause" : "Play"}>
          {youtube.playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
        </button>
        <button type="button" className="icon-btn" onClick={youtube.next} aria-label="Next">
          <NextIcon />
        </button>
      </div>
    </div>
  );
}

function SpotifyMusic({
  spotify,
  source,
  onSource,
}: {
  spotify: Spotify;
  source: MusicSource;
  onSource: (source: MusicSource) => void;
}) {
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="music-stage yt">
      <SourceSwitch source={source} onSource={onSource} />
      <p className="music-meta">Spotify · {spotify.current.title}</p>
      <iframe className="spotify-frame" title={spotify.current.title} src={spotifyEmbed(spotify.current.uri)} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
      <div className="yt-row">
        {spotify.picks.map((pick) => (
          <button
            key={pick.uri}
            type="button"
            className={pick.uri === spotify.current.uri ? "text-btn on" : "text-btn"}
            onClick={() => spotify.open(pick.uri, pick.title)}
          >
            {pick.title}
          </button>
        ))}
      </div>
      <form
        className="yt-search"
        onSubmit={(event) => {
          event.preventDefault();
          const target = spotifyTarget(link);
          if (!target) {
            setNote("Paste a Spotify song, album, or playlist link.");
            return;
          }
          setNote("");
          spotify.open(target.uri, target.title);
          setLink("");
        }}
      >
        <input
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="Paste a Spotify link"
          aria-label="Spotify link"
        />
        <button type="submit" className="link-btn">
          Open
        </button>
      </form>
      {note ? <p className="fine">{note}</p> : <p className="fine">Spotify plays with the account in this browser.</p>}
    </div>
  );
}


