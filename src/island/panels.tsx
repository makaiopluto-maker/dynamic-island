import { useEffect, useRef } from "react";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./Icons.tsx";
import type { useGemini } from "./useGemini.ts";
import type { useRadio } from "./useRadio.ts";

type Gemini = ReturnType<typeof useGemini>;
type Radio = ReturnType<typeof useRadio>;

export function GeminiView({ gemini }: { gemini: Gemini }) {
  const thread = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = thread.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [gemini.turns, gemini.pending]);

  return (
    <form
      className="gemini"
      onSubmit={(event) => {
        event.preventDefault();
        void gemini.send();
      }}
    >
      <div className="thread" ref={thread}>
        {gemini.turns.length === 0 ? (
          <p className="fine">
            {gemini.configured === false
              ? "Gemini isn't connected on this copy yet."
              : "Ask Gemini. The answer stays in this island."}
          </p>
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
          disabled={gemini.configured === false || gemini.pending}
        />
        <button type="submit" className="link-btn" disabled={gemini.configured === false || gemini.pending || !gemini.draft.trim()}>
          Send
        </button>
      </div>
    </form>
  );
}

export function RadioView({ radio }: { radio: Radio }) {
  return (
    <div className="radio">
      <div className="radio-now">
        <p className="kicker">
          Channel {radio.index + 1} of {radio.stations.length}
        </p>
        <h2>{radio.station.name}</h2>
        <p className="fine">{radio.failed ? "This station didn't start." : radio.station.detail}</p>
      </div>
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
        {radio.stations.map((station, index) => (
          <button
            key={station.id}
            type="button"
            role="option"
            className={station.id === radio.station.id ? "text-btn on" : "text-btn"}
            aria-selected={station.id === radio.station.id}
            onClick={() => radio.choose(station.id)}
          >
            <span className="channel-no">{index + 1}</span>
            <span>
              <strong>{station.name}</strong>
              <em>{station.detail}</em>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
