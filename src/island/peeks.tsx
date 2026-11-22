import { useEffect, useMemo, useRef, useState } from "react";
import { formatWhen, type CalendarEvent, type IslandContact, type IslandPhoto, type IslandWeather, type LiveState, type MailMessage, type useWeather } from "./desk.ts";
import { seoulFace } from "./format.ts";
import { connectGoogle } from "./googleConnect.ts";
import type { PeekId } from "./types.ts";
import { useGooglePhotos } from "./useGooglePhotos.ts";

function GoogleRow({
  live,
  onDisconnect,
  onRefresh,
}: {
  live: LiveState;
  onDisconnect: () => void;
  onRefresh?: () => void;
}) {
  if (!live.ready) return <p className="fine">계정 확인 중…</p>;
  if (!live.googleConfigured) {
    return <p className="fine">설정에서 Google OAuth를 저장하면 메일·캘린더·포토가 연결됩니다.</p>;
  }
  if (!live.connected) {
    return (
      <button
        type="button"
        className="link-btn"
        onClick={() => {
          void connectGoogle().then((ok) => {
            if (ok) onRefresh?.();
          });
        }}
      >
        Google 연결
      </button>
    );
  }
  return (
    <div className="account-row">
      <span>{live.account ?? "Google"}</span>
      <button type="button" className="text-btn" onClick={onDisconnect}>
        연결 해제
      </button>
    </div>
  );
}

function Badge({ source }: { source: "google" | "sample" }) {
  return <span className={source === "google" ? "badge live" : "badge"}>{source === "google" ? "Google" : "연결 필요"}</span>;
}

function MailList({
  messages,
  error,
  openId,
  onOpen,
}: {
  messages: MailMessage[];
  error?: string;
  openId?: string | null;
  onOpen?: (id: string) => void;
}) {
  if (error) return <p className="fine">메일에 닿지 못했습니다.</p>;
  if (!messages.length) return <p className="fine">새 메일이 없습니다. Google을 연결하면 여기에 옵니다.</p>;
  return (
    <ul className="peek-scroll rows">
      {messages.map((message) => (
        <li key={message.id}>
          <button
            type="button"
            className={message.unread ? "row unread" : "row"}
            aria-current={openId === message.id ? "true" : undefined}
            onClick={() => onOpen?.(message.id)}
          >
            <i className="dot" />
            <span>
              <strong>{message.from}</strong>
              <em>{message.subject}</em>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MailPeek({
  live,
  onRefresh,
  onDisconnect,
}: {
  live: LiveState;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  const unread = live.mail.messages.filter((message) => message.unread).length;
  const [pane, setPane] = useState<"list" | "read" | "write">("list");
  const [openId, setOpenId] = useState<string | null>(null);
  const [letter, setLetter] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const google = live.mail.source === "google";

  const open = async (id: string) => {
    setOpenId(id);
    setPane("read");
    if (!google || id.startsWith("sample-")) {
      const message = live.mail.messages.find((item) => item.id === id);
      setLetter(message?.text || message?.subject || "");
      return;
    }
    setLetter("Opening…");
    try {
      const response = await fetch(`/api/mail?id=${encodeURIComponent(id)}`);
      const body = (await response.json()) as { text?: string; error?: string };
      if (body.error === "reconnect") {
        setLetter("Connect Google again so this island can open mail.");
        return;
      }
      setLetter(body.text || "This message has no text.");
    } catch {
      setLetter("Couldn’t open this message.");
    }
  };

  const send = async () => {
    if (!google) {
      setNote("Connect Google to send mail.");
      return;
    }
    setSending(true);
    setNote("");
    try {
      const response = await fetch("/api/mail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, subject, text }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.ok) {
        setTo("");
        setSubject("");
        setText("");
        setNote("Sent.");
        onRefresh();
      } else if (body?.error === "reconnect") {
        setNote("Connect Google again so this island can send mail.");
      } else if (response.status === 429) {
        setNote("Too many messages just now. Wait a minute.");
      } else {
        setNote("Couldn’t send that.");
      }
    } catch {
      setNote("Couldn’t send that.");
    } finally {
      setSending(false);
    }
  };

  const opened = live.mail.messages.find((message) => message.id === openId);

  if (pane === "read" && openId) {
    return (
      <div className="peek stack">
        <div className="peek-head">
          <button type="button" className="text-btn" onClick={() => setPane("list")}>
            Inbox
          </button>
          <Badge source={live.mail.source} />
        </div>
        <h2>{opened?.subject ?? "Mail"}</h2>
        <p className="fine">{opened?.from}</p>
        <p className="letter peek-scroll">{letter}</p>
      </div>
    );
  }

  if (pane === "write") {
    return (
      <div className="peek stack">
        <div className="peek-head">
          <button type="button" className="text-btn" onClick={() => setPane("list")}>
            Inbox
          </button>
          <Badge source={live.mail.source} />
        </div>
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="field">
            To
            <input value={to} onChange={(event) => setTo(event.target.value)} inputMode="email" autoComplete="email" required />
          </label>
          <label className="field">
            Subject
            <input value={subject} onChange={(event) => setSubject(event.target.value)} required />
          </label>
          <label className="field">
            Message
            <textarea value={text} onChange={(event) => setText(event.target.value)} required />
          </label>
          <button type="submit" className="link-btn" disabled={sending}>
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
        {note ? <p className="fine">{note}</p> : null}
      </div>
    );
  }

  return (
    <div className="peek stack">
      <div className="peek-head">
        <h2>{unread > 0 ? `안 읽음 ${unread}` : "메일"}</h2>
        <Badge source={live.mail.source} />
      </div>
      <MailList messages={live.mail.messages} error={live.mail.error} openId={openId} onOpen={(id) => void open(id)} />
      <button type="button" className="link-btn" onClick={() => setPane("write")} disabled={!google}>
        새 메일
      </button>
      {note ? <p className="fine">{note}</p> : null}
      <GoogleRow live={live} onDisconnect={onDisconnect} onRefresh={onRefresh} />
    </div>
  );
}

function monthMatrix(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startPad = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<{ ymd: string; day: number; inMonth: boolean }> = [];
  for (let i = 0; i < startPad; i += 1) {
    const date = new Date(Date.UTC(year, month - 1, -startPad + i + 1));
    cells.push({
      ymd: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      inMonth: false,
    });
  }
  for (let day = 1; day <= days; day += 1) {
    const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ ymd, day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells.at(-1)!;
    const date = new Date(`${last.ymd}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    cells.push({ ymd: date.toISOString().slice(0, 10), day: date.getUTCDate(), inMonth: false });
  }
  return cells;
}

function CalendarPeek({
  live,
  now,
  onRefresh,
  onDisconnect,
}: {
  live: LiveState;
  now: Date;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  const initial = seoulFace(now, null).ymd;
  const [selected, setSelected] = useState(initial);
  const [cursor, setCursor] = useState(() => {
    const [y, m] = initial.split("-").map(Number);
    return { year: y, month: m };
  });
  const [events, setEvents] = useState<CalendarEvent[]>(live.calendar.events);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const google = live.calendar.source === "google";
  const cells = useMemo(() => monthMatrix(cursor.year, cursor.month), [cursor.month, cursor.year]);

  useEffect(() => {
    if (!google) {
      setEvents(live.calendar.events);
      return;
    }
    let stop = false;
    setLoading(true);
    void fetch(`/api/calendar?date=${encodeURIComponent(selected)}`)
      .then(async (response) => {
        const body = (await response.json()) as { events?: CalendarEvent[]; error?: string };
        if (stop) return;
        if (response.ok) setEvents(body.events ?? []);
        else setEvents([]);
      })
      .catch(() => {
        if (!stop) setEvents([]);
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [google, live.calendar.events, selected]);

  const shiftMonth = (delta: number) => {
    setCursor((current) => {
      const date = new Date(Date.UTC(current.year, current.month - 1 + delta, 1));
      return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
    });
  };

  const add = async () => {
    if (!google) {
      setNote("Google을 연결하면 일정을 등록할 수 있습니다.");
      return;
    }
    if (end <= start) {
      setNote("종료 시간이 시작보다 뒤여야 합니다.");
      return;
    }
    setSaving(true);
    setNote("");
    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, start, end, date: selected }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; event?: CalendarEvent } | null;
      if (response.ok) {
        setTitle("");
        setNote("일정을 등록했습니다.");
        if (body?.event) setEvents((current) => [...current, body.event!]);
        onRefresh();
      } else if (body?.error === "reconnect") {
        setNote("Google을 다시 연결하세요.");
      } else if (response.status === 429) {
        setNote("너무 자주 등록했습니다. 잠시 후 다시 시도하세요.");
      } else {
        setNote("일정을 등록하지 못했습니다.");
      }
    } catch {
      setNote("일정을 등록하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="peek stack">
      <div className="peek-head">
        <h2>
          {cursor.year}.{String(cursor.month).padStart(2, "0")}
        </h2>
        <Badge source={live.calendar.source} />
      </div>
      <div className="month-nav">
        <button type="button" className="text-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
          이전
        </button>
        <button type="button" className="text-btn" onClick={() => shiftMonth(1)} aria-label="Next month">
          다음
        </button>
      </div>
      <div className="month-grid" role="grid" aria-label="Calendar">
        {["월", "화", "수", "목", "금", "토", "일"].map((label) => (
          <span key={label} className="month-dow">
            {label}
          </span>
        ))}
        {cells.map((cell) => (
          <button
            key={cell.ymd}
            type="button"
            role="gridcell"
            className={[
              "month-day",
              cell.inMonth ? "" : "dim",
              cell.ymd === selected ? "on" : "",
              cell.ymd === initial ? "today" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => {
              setSelected(cell.ymd);
              if (!cell.inMonth) {
                const [y, m] = cell.ymd.split("-").map(Number);
                setCursor({ year: y, month: m });
              }
              setNote("");
            }}
          >
            {cell.day}
          </button>
        ))}
      </div>
      <p className="fine">{selected} · {loading ? "일정 불러오는 중…" : "날짜를 눌러 일정을 등록하세요"}</p>
      <EventList events={events} error={live.calendar.error} />
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <label className="field">
          제목
          <input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="일정 제목" />
        </label>
        <div className="when">
          <label className="field">
            시작
            <input type="time" value={start} onChange={(event) => setStart(event.target.value)} required />
          </label>
          <label className="field">
            종료
            <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} required />
          </label>
        </div>
        <button type="submit" className="link-btn" disabled={saving || !google}>
          {saving ? "등록 중…" : `${selected}에 등록`}
        </button>
      </form>
      {note ? <p className="fine">{note}</p> : null}
      <GoogleRow live={live} onDisconnect={onDisconnect} onRefresh={onRefresh} />
    </div>
  );
}

function EventList({ events, error }: { events: CalendarEvent[]; error?: string }) {
  if (error) return <p className="fine">Couldn’t reach Calendar.</p>;
  if (!events.length) return <p className="fine">Nothing on the day.</p>;
  return (
    <ul className="peek-scroll rows">
      {events.map((event) => (
        <li key={event.id} className="row">
          <i className="dot on" />
          <span>
            <strong>{event.title}</strong>
            <em>{formatWhen(event.start, event.allDay)}</em>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function PeekView({
  id,
  now,
  live,
  weather,
  photos,
  contacts,
  contactsSupported,
  brightness,
  onBrightness,
  onAddPhotos,
  onPickContacts,
  onDisconnect,
  onRefresh,
  geminiReady,
}: {
  id: PeekId;
  now: Date;
  live: LiveState;
  weather: ReturnType<typeof useWeather>;
  photos: IslandPhoto[];
  contacts: IslandContact[];
  contactsSupported: boolean;
  brightness: { level: number | null; supported: boolean };
  onBrightness: (level: number) => void;
  onAddPhotos: (files: FileList | null) => void;
  onPickContacts: () => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  geminiReady: boolean | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const googlePhotos = useGooglePhotos(id === "photos" && live.connected);
  const [dragged, setDragged] = useState<number | null>(null);
  const bright = dragged ?? brightness.level ?? 70;

  if (id === "mail") return <MailPeek live={live} onRefresh={onRefresh} onDisconnect={onDisconnect} />;

  if (id === "calendar") return <CalendarPeek live={live} now={now} onRefresh={onRefresh} onDisconnect={onDisconnect} />;

  if (id === "photos") {
    const google = googlePhotos.photos;
    const library = googlePhotos.library;
    const hasPhotos = google.length > 0 || library.length > 0 || photos.length > 0;
    return (
      <div className="peek stack">
        <div className="peek-head">
          <h2>Photos</h2>
          <span className={live.connected ? "badge live" : "badge"}>{live.connected ? "Google Photos" : "연결 필요"}</span>
        </div>
        {hasPhotos ? (
          <div className="photo-grid peek-scroll">
            {google.map((photo) => (
              <img
                key={`${photo.sessionId}-${photo.id}`}
                src={`/api/photos/media?session=${encodeURIComponent(photo.sessionId)}&item=${encodeURIComponent(photo.id)}`}
                alt=""
              />
            ))}
            {library.map((id) => (
              <img key={id} src={`/api/photos/library/media?id=${encodeURIComponent(id)}`} alt="" />
            ))}
            {photos.map((photo) => (
              <img key={photo.id} src={photo.url} alt="" />
            ))}
          </div>
        ) : (
          <p className="fine">
            {googlePhotos.error === "reconnect"
              ? "Google을 다시 연결하세요."
              : googlePhotos.uploading
                ? "Google Photos에 올리는 중…"
                : googlePhotos.picking
                  ? "Google Photos에서 사진을 고르면 여기에 나타납니다."
                  : live.connected
                    ? "Google Photos에서 사진을 고르거나, 이 기기에서 업로드하세요."
                    : "Google을 연결하면 Google Photos와 연동됩니다."}
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          hidden
          onChange={(event) => {
            const files = event.target.files;
            if (live.connected) void googlePhotos.upload(files);
            else void onAddPhotos(files);
            event.target.value = "";
          }}
        />
        <div className="photo-actions">
          {live.connected ? (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                const popup = window.open("about:blank", "_blank");
                void googlePhotos.choose(popup);
              }}
            >
              Google Photos에서 선택
            </button>
          ) : live.googleConfigured ? (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                void connectGoogle().then((ok) => {
                  if (ok) onRefresh();
                });
              }}
            >
              Google Photos 연결
            </button>
          ) : (
            <p className="fine">설정에서 Google OAuth를 저장한 뒤 연결하세요.</p>
          )}
          {googlePhotos.error === "reconnect" ? (
            <button type="button" className="text-btn" onClick={() => void connectGoogle().then((ok) => ok && onRefresh())}>
              다시 연결
            </button>
          ) : null}
          <button type="button" className="text-btn" onClick={() => fileRef.current?.click()} disabled={googlePhotos.uploading || !live.connected}>
            {live.connected ? "이 기기에서 업로드" : "연결 후 업로드"}
          </button>
        </div>
        {googlePhotos.uploading ? <p className="fine">Google Photos에 올리는 중…</p> : null}
        {googlePhotos.error === "unreachable" ? <p className="fine">사진을 가져오지 못했습니다.</p> : null}
        <GoogleRow live={live} onDisconnect={onDisconnect} onRefresh={onRefresh} />
      </div>
    );
  }

  if (id === "phone") {
    return (
      <div className="peek stack">
        <div className="peek-head">
          <h2>Phone</h2>
          <span className="badge live">{contactsSupported ? "Contacts" : "Unavailable"}</span>
        </div>
        {contacts.length ? (
          <ul className="peek-scroll rows">
            {contacts.map((contact) => (
              <li key={contact.tel} className="row">
                <i className="dot on" />
                <span>
                  <strong>{contact.name}</strong>
                  <a href={`tel:${contact.tel}`}>{contact.tel}</a>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fine">
            {contactsSupported
              ? "No contacts on the island yet."
              : "This browser can’t read the phone. Contacts open in Chrome on Android."}
          </p>
        )}
        {contactsSupported ? (
          <button type="button" className="link-btn" onClick={() => void onPickContacts()}>
            Choose contacts
          </button>
        ) : null}
      </div>
    );
  }

  if (id === "weather") return <WeatherPeek live={live} weather={weather.current} failed={weather.failed} />;

  if (id === "plus") {
    return (
      <SettingsPeek
        live={live}
        geminiReady={geminiReady}
        brightnessSupported={brightness.supported}
        contactsSupported={contactsSupported}
        onDisconnect={onDisconnect}
        onRefresh={onRefresh}
      />
    );
  }

  return (
    <div className="peek stack">
      <div className="peek-head">
        <h2>Brightness</h2>
        <span className={brightness.supported ? "badge live" : "badge"}>{brightness.supported ? "Monitor" : "Windows app"}</span>
      </div>
      <p className="bright-level">{bright}%</p>
      <input
        className="scrub bright-slider"
        type="range"
        min={0}
        max={100}
        value={bright}
        aria-label="Monitor brightness"
        style={{ ["--p" as string]: `${bright}%` }}
        onChange={(event) => {
          const next = Number(event.target.value);
          setDragged(next);
          onBrightness(next);
        }}
      />
      <p className="fine">
        {brightness.supported
          ? "This slider moves the monitor on this PC."
          : "The Windows app on this PC moves the monitor. This copy only shows the level."}
      </p>
    </div>
  );
}

function useAlertPermission() {
  const supported = typeof Notification !== "undefined";
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    supported ? Notification.permission : "unsupported",
  );
  const allow = () => {
    if (!supported || permission !== "default") return;
    void Notification.requestPermission().then(setPermission);
  };
  const label =
    permission === "granted"
      ? "On"
      : permission === "denied"
        ? "Blocked in the browser"
        : permission === "unsupported"
          ? "This browser has no alerts"
          : "Off";
  return { permission, allow, label };
}

function SettingsPeek({
  live,
  geminiReady,
  brightnessSupported,
  contactsSupported,
  onDisconnect,
  onRefresh,
}: {
  live: LiveState;
  geminiReady: boolean | null;
  brightnessSupported: boolean;
  contactsSupported: boolean;
  onDisconnect: () => void;
  onRefresh: () => void;
}) {
  const alerts = useAlertPermission();
  const desktop = Boolean(window.islandDesktop);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [setupNote, setSetupNote] = useState("");
  const [saving, setSaving] = useState(false);

  const saveGoogle = async () => {
    setSaving(true);
    setSetupNote("");
    try {
      const response = await fetch("/api/google/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: clientId, secret: clientSecret }),
      });
      if (!response.ok) {
        setSetupNote("이 PC 설치본에서만 Google OAuth를 저장할 수 있습니다.");
        return;
      }
      setClientId("");
      setClientSecret("");
      setSetupNote("저장했습니다. 이제 Google을 연결하세요.");
      onRefresh();
    } catch {
      setSetupNote("저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="peek stack">
      <div className="peek-head">
        <h2>Settings</h2>
        <span className={live.connected ? "badge live" : "badge"}>{live.connected ? "Google" : "Setup"}</span>
      </div>
      <div className="setting">
        <span>
          <strong>Google</strong>
          <em>
            {live.connected
              ? (live.account ?? "연결됨")
              : live.googleConfigured
                ? "메일 · 캘린더 · Google Photos"
                : desktop
                  ? "OAuth 클라이언트 ID/Secret 저장 필요"
                  : "배포 환경의 Google 비밀값이 필요합니다"}
          </em>
        </span>
        {!live.ready ? (
          <span className="badge">…</span>
        ) : !live.googleConfigured ? (
          <span className="badge">설정</span>
        ) : live.connected ? (
          <span className="setting-actions">
            <button type="button" className="text-btn" onClick={() => void connectGoogle().then((ok) => ok && onRefresh())}>
              다시 연결
            </button>
            <button type="button" className="text-btn" onClick={onDisconnect}>
              연결 해제
            </button>
          </span>
        ) : (
          <button type="button" className="link-btn" onClick={() => void connectGoogle().then((ok) => ok && onRefresh())}>
            연결
          </button>
        )}
      </div>
      {!live.googleConfigured && desktop ? (
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            void saveGoogle();
          }}
        >
          <label className="field">
            Client ID
            <input value={clientId} onChange={(event) => setClientId(event.target.value)} required autoComplete="off" />
          </label>
          <label className="field">
            Client Secret
            <input
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              required
              type="password"
              autoComplete="off"
            />
          </label>
          <button type="submit" className="link-btn" disabled={saving}>
            {saving ? "저장 중…" : "Google OAuth 저장"}
          </button>
          <p className="fine">Google Cloud Console 웹 클라이언트 · 리디렉션 URI에 http://127.0.0.1:포트/api/auth/google/callback 추가</p>
          {setupNote ? <p className="fine">{setupNote}</p> : null}
        </form>
      ) : null}
      <div className="setting">
        <span>
          <strong>Alerts</strong>
          <em>{alerts.label}</em>
        </span>
        {alerts.permission === "default" ? (
          <button type="button" className="link-btn" onClick={alerts.allow}>
            Allow
          </button>
        ) : null}
      </div>
      <ul className="peek-scroll rows plain">
        <li>Weather · Seoul</li>
        <li>Mail · {live.mail.source === "google" ? "실제 주고받기" : "Google 연결 필요"}</li>
        <li>Calendar · {live.calendar.source === "google" ? "날짜 클릭으로 등록" : "Google 연결 필요"}</li>
        <li>Photos · {live.connected ? "Google Photos" : "Google 연결 필요"}</li>
        <li>Music · YouTube Music / Spotify</li>
        <li>AI · {geminiReady == null ? "준비 중" : geminiReady ? "ready" : "다시 열어주세요"}</li>
        <li>Radio · news stations</li>
        <li>Phone · {contactsSupported ? "contacts" : "not in this browser"}</li>
        <li>Lights · {brightnessSupported ? "this monitor" : "the Windows app on this PC"}</li>
      </ul>
    </div>
  );
}

function WeatherPeek({
  live,
  weather,
  failed,
}: {
  live: LiveState;
  weather: IslandWeather | null;
  failed: boolean;
}) {
  return (
    <div className="peek stack">
      <div className="peek-head">
        <h2>Seoul</h2>
        <span className={weather ? "badge live" : "badge"}>{weather ? "Live" : "Weather"}</span>
      </div>
      {weather ? (
        <>
          <p className="temp-hero">
            {weather.celsius}°<span>{weather.summary}</span>
          </p>
          <p className="fine">
            High {weather.high}° · Low {weather.low}°
          </p>
          {weather.hours.length ? (
            <ol className="hours">
              {weather.hours.map((hour) => (
                <li key={hour.label}>
                  <span>{hour.label}</span>
                  <strong>{hour.celsius}°</strong>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : (
        <p className="fine">{failed ? "Seoul weather didn’t load." : "Seoul weather is still loading."}</p>
      )}
      <div className="peek-head">
        <h2>Today</h2>
        <Badge source={live.calendar.source} />
      </div>
      <EventList events={live.calendar.events} error={live.calendar.error} />
    </div>
  );
}
