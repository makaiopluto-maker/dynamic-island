import { useEffect, useRef, useState } from "react";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "./Icons.tsx";
import type { useOpenClaw } from "./useOpenClaw.ts";
import type { Station, useRadio } from "./useRadio.ts";

type OpenClaw = ReturnType<typeof useOpenClaw>;
type Radio = ReturnType<typeof useRadio>;

function openClawHint(status: OpenClaw["status"]) {
  if (status === "checking") return "OpenClaw Gateway를 확인하는 중…";
  if (status === "offline") {
    return "PC에 OpenClaw를 설치하고 Gateway를 켠 뒤 다시 시도하세요. powershell -c \"irm https://openclaw.ai/install.ps1 | iex\"";
  }
  if (status === "disabled") {
    return "~/.openclaw/openclaw.json 에서 gateway.http.endpoints.chatCompletions.enabled 를 true 로 켠 다음 Gateway를 재시작하세요.";
  }
  if (status === "need_token") {
    return "OpenClaw Gateway 토큰이 필요하면 아래에 한 번 저장하세요. 없으면 바로 연결을 다시 확인합니다.";
  }
  return "무엇이든 물어보세요. 답은 OpenClaw를 통해 이 PC에서만 이어집니다.";
}

export function GeminiView({ gemini }: { gemini: OpenClaw }) {
  const thread = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState("");
  const needsSetup = gemini.status !== "ready" && gemini.status !== "checking";
  useEffect(() => {
    const node = thread.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [gemini.turns, gemini.pending]);

  return (
    <form
      className="gemini"
      onSubmit={(event) => {
        event.preventDefault();
        if (gemini.status !== "ready") return;
        void gemini.send();
      }}
    >
      <div className="thread" ref={thread}>
        {gemini.turns.length === 0 ? <p className="fine">{openClawHint(gemini.status)}</p> : null}
        {gemini.turns.map((turn, index) => (
          <p key={`${turn.role}-${index}`} className={turn.role === "user" ? "bubble user" : "bubble model"}>
            {turn.text}
          </p>
        ))}
        {gemini.pending ? <p className="fine">OpenClaw가 쓰는 중…</p> : null}
        {gemini.error ? <p className="fine">{gemini.error}</p> : null}
      </div>
      {needsSetup ? (
        <div className="ask">
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              void gemini.saveToken(token).then((saved) => {
                if (saved) setToken("");
                else void gemini.refresh();
              });
            }}
            placeholder="OpenClaw Gateway 토큰 (선택)"
            aria-label="OpenClaw gateway token"
            type="password"
            autoComplete="off"
            disabled={gemini.pending}
          />
          <button
            type="button"
            className="link-btn"
            disabled={gemini.pending}
            onClick={() => {
              void gemini.saveToken(token).then((saved) => {
                if (saved) setToken("");
                else void gemini.refresh();
              });
            }}
          >
            {token.trim() ? "연결" : "다시 확인"}
          </button>
        </div>
      ) : (
        <div className="ask">
          <input
            value={gemini.draft}
            onChange={(event) => gemini.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (gemini.status === "ready" && gemini.draft.trim()) void gemini.send();
            }}
            placeholder="OpenClaw에게 묻기"
            aria-label="Message OpenClaw"
            disabled={gemini.pending || gemini.status !== "ready"}
          />
          <button
            type="submit"
            className="link-btn"
            disabled={gemini.pending || gemini.status !== "ready" || !gemini.draft.trim()}
          >
            보내기
          </button>
        </div>
      )}
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
      <label className="dial volume">
        <strong>{Math.round(radio.volume * 100)}%</strong>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={radio.volume}
          aria-label="Volume"
          onChange={(event) => radio.setVolume(Number(event.target.value))}
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
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              void search();
            }}
            placeholder="YTN, KBS, BBC"
            aria-label="Find a news station"
          />
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
