import { useEffect, useRef, useState } from "react";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./Icons.tsx";
import type { useGemini } from "./useGemini.ts";
import type { Station, useRadio } from "./useRadio.ts";

type Gemini = ReturnType<typeof useGemini>;
type Radio = ReturnType<typeof useRadio>;

export function GeminiView({ gemini }: { gemini: Gemini }) {
  const thread = useRef<HTMLDivElement>(null);
  const locked = gemini.configured !== true;
  useEffect(() => {
    const node = thread.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [gemini.turns, gemini.pending]);

  return (
    <form
      className="gemini"
      onSubmit={(event) => {
        event.preventDefault();
        if (!locked) void gemini.send();
      }}
    >
      <div className="thread" ref={thread}>
        {gemini.turns.length === 0 ? (
          <p className="fine">{locked ? "Gemini는 이 웹사이트에서 잠겨 있습니다." : "Ask Gemini. The answer stays in this island."}</p>
        ) : null}
        {gemini.turns.map((turn, index) => (
          <p key={`${turn.role}-${index}`} className={turn.role === "user" ? "bubble user" : "bubble model"}>
            {turn.text}
          </p>
        ))}
        {gemini.pending ? <p className="fine">Gemini is writing…</p> : null}
        {gemini.error ? <p className="fine">{gemini.error}</p> : null}
      </div>
      <div className="ask">
        <input
          value={gemini.draft}
          onChange={(event) => gemini.setDraft(event.target.value)}
          placeholder="Ask Gemini"
          aria-label="Message Gemini"
          disabled={locked || gemini.pending}
        />
        <button type="submit" className="link-btn" disabled={locked || gemini.pending || !gemini.draft.trim()}>
          Send
        </button>
      </div>
    </form>
  );
}

export function RadioView({ radio }: { radio: Radio }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Station[]>([]);
  const [note, setNote] = useState("");

  const search = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setNote("");
    try {
      const response = await fetch(`/api/radio/search?q=${encodeURIComponent(q)}`);
      const body = (await response.json()) as { stations?: Station[]; error?: string };
      if (!response.ok || body.error) {
        setFound([]);
        setNote(response.status === 429 ? "Too many lookups. Wait a minute." : "뉴스 채널이 없습니다.");
        return;
      }
      setFound(body.stations ?? []);
      if (!body.stations?.length) setNote("뉴스 채널이 없습니다.");
    } catch {
      setFound([]);
      setNote("뉴스 채널이 없습니다.");
    }
  };

  return (
    <div className="radio">
      <div className="radio-now">
        <p className="kicker">{radio.station.mhz ? `${radio.station.mhz.toFixed(1)} MHz` : "Channel"}</p>
        <h2>{radio.station.name}</h2>
        <p className="fine">
          {radio.tuning ? "Finding the signal…" : radio.failed ? "This station didn't start." : radio.station.detail}
        </p>
      </div>
      <label className="dial">
        <strong>{radio.mhz.toFixed(1)}</strong>
        <input
          type="range"
          min={87.5}
          max={108}
          step={0.1}
          value={radio.mhz}
          aria-label="Frequency"
          onChange={(event) => radio.tuneMhz(Number(event.target.value))}
        />
      </label>
      <div className="skiprow">
        <button type="button" className="icon-btn" onClick={radio.prev} aria-label="Previous channel">
          <PrevIcon />
        </button>
        <button
          type="button"
          className="icon-btn main"
          onClick={radio.toggle}
          aria-label={radio.playing ? "Pause radio" : "Play radio"}
          aria-pressed={radio.playing}
        >
          {radio.playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
        </button>
        <button type="button" className="icon-btn" onClick={radio.next} aria-label="Next channel">
          <NextIcon />
        </button>
      </div>
      <div className="station-list" role="listbox" aria-label="Radio channels">
        {radio.stations.map((station) => (
          <div
            key={station.id}
            className={station.id === radio.station.id ? "station-row on" : "station-row"}
            role="option"
            aria-selected={station.id === radio.station.id}
          >
            <button type="button" onClick={() => radio.choose(station.id)}>
              <span className="channel-no">{station.mhz ? station.mhz.toFixed(1) : "•"}</span>
              <span>
                <strong>{station.name}</strong>
                <em>{station.detail}</em>
              </span>
            </button>
            {station.saved ? (
              <button type="button" className="station-remove" onClick={() => radio.forget(station.id)} aria-label={`Remove ${station.name}`}>
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <form
        className="composer radio-find"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <label className="field">
          뉴스 찾기
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="YTN, KBS, BBC" aria-label="Find a news station" />
        </label>
        <button type="submit" className="link-btn">
          Search
        </button>
      </form>
      {note ? <p className="fine">{note}</p> : null}
      {found.length ? (
        <div className="station-list found">
          {found.map((station) => (
            <button
              key={station.id}
              type="button"
              className="text-btn"
              onClick={() => {
                radio.save(station);
                setFound([]);
                setQuery("");
              }}
            >
              Add {station.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
