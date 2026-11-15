import { useRef, useState } from "react";
import { formatWhen, type CalendarEvent, type IslandContact, type IslandPhoto, type IslandWeather, type LiveState, type MailMessage, type useWeather } from "./desk.ts";
import { seoulFace } from "./format.ts";
import type { PeekId } from "./types.ts";
import { useGooglePhotos } from "./useGooglePhotos.ts";

function GoogleRow({
  live,
  onDisconnect,
}: {
  live: LiveState;
  onDisconnect: () => void;
}) {
  if (!live.ready) return <p className="fine">Checking the account…</p>;
  if (!live.googleConfigured) return <p className="fine">Sample, until Google is connected.</p>;
  if (!live.connected) {
    return (
      <a className="link-btn" href="/api/auth/google">
        Connect Google
      </a>
    );
  }
  return (
    <div className="account-row">
      <span>{live.account ?? "Google"}</span>
      <button type="button" className="text-btn" onClick={onDisconnect}>
        Disconnect
      </button>
    </div>
  );
}

function Badge({ source }: { source: "google" | "sample" }) {
  return <span className={source === "google" ? "badge live" : "badge"}>{source === "google" ? "Google" : "Sample"}</span>;
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
  if (error) return <p className="fine">Couldn’t reach Gmail.</p>;
  if (!messages.length) return <p className="fine">Inbox zero.</p>;
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
        <h2>{unread > 0 ? `${unread} unread` : "Mail"}</h2>
        <Badge source={live.mail.source} />
      </div>
      <MailList messages={live.mail.messages} error={live.mail.error} openId={openId} onOpen={(id) => void open(id)} />
      <button type="button" className="link-btn" onClick={() => setPane("write")}>
        Write
      </button>
      {note ? <p className="fine">{note}</p> : null}
      <GoogleRow live={live} onDisconnect={onDisconnect} />
    </div>
  );
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
  const face = seoulFace(now, null);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const google = live.calendar.source === "google";

  const add = async () => {
    if (!google) {
      setNote("Connect Google to add an event.");
      return;
    }
    if (end <= start) {
      setNote("End has to be after the start.");
      return;
    }
    setSaving(true);
    setNote("");
    try {
      const response = await fetch("/api/calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, start, end }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.ok) {
        setTitle("");
        setNote("Added to today.");
        onRefresh();
      } else if (body?.error === "reconnect") {
        setNote("Connect Google again so this island can add events.");
      } else if (response.status === 429) {
        setNote("Too many events just now. Wait a minute.");
      } else {
        setNote("Couldn’t add that event.");
      }
    } catch {
      setNote("Couldn’t add that event.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="peek stack">
      <div className="peek-head">
        <h2>{face.longDate}</h2>
        <Badge source={live.calendar.source} />
      </div>
      <EventList events={live.calendar.events} error={live.calendar.error} />
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <label className="field">
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <div className="when">
          <label className="field">
            Start
            <input type="time" value={start} onChange={(event) => setStart(event.target.value)} required />
          </label>
          <label className="field">
            End
            <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} required />
          </label>
        </div>
        <button type="submit" className="link-btn" disabled={saving}>
          {saving ? "Adding…" : "Add to today"}
        </button>
      </form>
      {note ? <p className="fine">{note}</p> : null}
      <GoogleRow live={live} onDisconnect={onDisconnect} />
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
          <span className={live.connected ? "badge live" : "badge"}>{live.connected ? "Google Photos" : "This device"}</span>
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
              ? "Connect Google again so Photos can open."
              : googlePhotos.uploading
                ? "Uploading to Google Photos…"
                : googlePhotos.picking
                  ? "Pick the pictures in Google Photos. They land here when you finish."
                  : live.connected
                    ? "Choose pictures to view, or upload one from this device."
                    : "Connect Google Photos to view and upload, or keep a picture on this device."}
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
              View in Google Photos
            </button>
          ) : live.googleConfigured ? (
            <a className="link-btn" href="/api/auth/google">
              Connect Google
            </a>
          ) : (
            <p className="fine">Sample, until Google is connected.</p>
          )}
          {googlePhotos.error === "reconnect" ? (
            <a className="text-btn" href="/api/auth/google">
              Connect again
            </a>
          ) : null}
          <button type="button" className="text-btn" onClick={() => fileRef.current?.click()} disabled={googlePhotos.uploading}>
            {live.connected ? "Upload to Google Photos" : "Add from this device"}
          </button>
        </div>
        {googlePhotos.uploading ? <p className="fine">Uploading to Google Photos…</p> : null}
        {googlePhotos.error === "unreachable" ? <p className="fine">Google Photos didn’t take that picture.</p> : null}
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
}: {
  live: LiveState;
  geminiReady: boolean | null;
  brightnessSupported: boolean;
  contactsSupported: boolean;
  onDisconnect: () => void;
}) {
  const alerts = useAlertPermission();
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
              ? (live.account ?? "Connected")
              : live.googleConfigured
                ? "Mail, calendar, photos, and your library"
                : "YouTube Music plays from search"}
          </em>
        </span>
        {!live.ready ? (
          <span className="badge">…</span>
        ) : !live.googleConfigured ? (
          <span className="badge">Search</span>
        ) : live.connected ? (
          <span className="setting-actions">
            <a className="text-btn" href="/api/auth/google">
              Connect again
            </a>
            <button type="button" className="text-btn" onClick={onDisconnect}>
              Disconnect
            </button>
          </span>
        ) : (
          <a className="link-btn" href="/api/auth/google">
            Connect
          </a>
        )}
      </div>
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
        <li>Mail · {live.mail.source === "google" ? "read and send" : "sample"}</li>
        <li>Calendar · {live.calendar.source === "google" ? "today, and new events" : "sample"}</li>
        <li>Photos · {live.connected ? "view and upload" : "this device"}</li>
        <li>Music · YouTube Music search, or Spotify</li>
        <li>Gemini · {geminiReady == null ? "checking" : geminiReady ? "ready" : "not connected on this copy"}</li>
        <li>Radio · Seoul frequencies and channels</li>
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
