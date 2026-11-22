import { useEffect, useRef, useState } from "react";
import { Cover } from "./Cover.tsx";
import { formatElapsed, formatRemaining } from "./format.ts";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./Icons.tsx";
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
    const title = spotifyOn ? spotify.current.title : youtube.playing && youtube.track ? youtube.track.title : "YouTube Music";
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
  const title = source === "spotify" ? spotify.current.title : youtube.track?.title ?? "YouTube Music";
  const artist = source === "spotify" ? "Spotify" : youtube.track?.artist ?? "Search a song";
  const playing = source === "spotify" ? spotify.playing : youtube.playing;
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
  youtube,
  spotify,
  source,
  onSource,
  live,
}: {
  youtube: YouTube;
  spotify: Spotify;
  source: MusicSource;
  onSource: (source: MusicSource) => void;
  live: LiveState;
}) {
  if (source === "spotify") return <SpotifyMusic spotify={spotify} source={source} onSource={onSource} />;
  return <YouTubeMusic youtube={youtube} source={source} onSource={onSource} live={live} />;
}

function YouTubeMusic({
  youtube,
  source,
  onSource,
  live,
}: {
  youtube: YouTube;
  source: MusicSource;
  onSource: (source: MusicSource) => void;
  live: LiveState;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const { attach } = youtube;
  useEffect(() => {
    attach(frame.current);
    return () => attach(null);
  }, [attach]);
  const length = Math.max(youtube.duration, 1);
  const progress = (youtube.position / length) * 100;
  const track = youtube.track;
  return (
    <div className="music-stage yt">
      <div className="yt-engine" ref={frame} aria-hidden="true" />
      <SourceSwitch source={source} onSource={onSource} />
      <div className="now">
        <div className="now-art">
          {track ? <img src={`https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`} alt="" /> : <Cover theme="dusk" />}
        </div>
        <div className="now-copy">
          <p className="kicker">YouTube Music</p>
          <h2>{track?.title ?? "노래 선택"}</h2>
          <p className="fine">{track?.artist ?? "목록에서 곡을 고르면 여기서 재생됩니다"}</p>
        </div>
      </div>
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
      {youtube.error === "reconnect" && live.googleConfigured ? (
        <a className="text-btn" href="/api/auth/google">
          라이브러리를 보려면 다시 연결
        </a>
      ) : youtube.error === "blocked" ? (
        <p className="fine">이 곡은 여기서 재생되지 않습니다. 다른 곡을 고르세요.</p>
      ) : youtube.error === "unreachable" ? (
        <p className="fine">노래를 찾지 못했습니다. 다시 찾아 보세요.</p>
      ) : null}
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
          placeholder="노래 찾기"
          aria-label="Find a song"
        />
        <button type="submit" className="link-btn">
          찾기
        </button>
      </form>
      <div className="song-list" role="listbox" aria-label="Choose a song">
        {youtube.tracks.length ? (
          youtube.tracks.map((item, at) => (
            <button
              key={`${item.id}-${at}`}
              type="button"
              role="option"
              aria-selected={at === youtube.index}
              className={at === youtube.index ? "song on" : "song"}
              onClick={() => youtube.playAt(at)}
            >
              <img src={`https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`} alt="" />
              <span>
                <strong>{item.title}</strong>
                <em>{item.artist}</em>
              </span>
            </button>
          ))
        ) : (
          <p className="fine">노래 목록을 불러오는 중</p>
        )}
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
      <div className="account-row">
        <a className="link-btn" href="https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F" target="_blank" rel="noreferrer">
          Spotify 로그인
        </a>
        <p className="music-meta">Spotify · {spotify.current.title}</p>
      </div>
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
      {note ? <p className="fine">{note}</p> : <p className="fine">로그인 후 아래 플레이어에서 재생됩니다.</p>}
    </div>
  );
}


