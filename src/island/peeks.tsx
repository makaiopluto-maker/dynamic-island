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

function MailList({ messages, error }: { messages: MailMessage[]; error?: string }) {
  if (error) return <p className="fine">Couldn’t reach Gmail.</p>;
  if (!messages.length) return <p className="fine">Inbox zero.</p>;
  return (
    <ul className="peek-scroll rows">
      {messages.map((message) => (
        <li key={message.id} className={message.unread ? "row unread" : "row"}>
          <i className="dot" />
          <span>
            <strong>{message.from}</strong>
            <em>{message.subject}</em>
          </span>
        </li>
      ))}
    </ul>
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
  geminiReady: boolean | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const face = seoulFace(now, null);
  const googlePhotos = useGooglePhotos(id === "photos" && live.connected);
  const [dragged, setDragged] = useState<number | null>(null);
  const bright = dragged ?? brightness.level ?? 70;

  if (id === "mail") {
    const unread = live.mail.messages.filter((message) => message.unread).length;
    return (
      <div className="peek stack">
        <div className="peek-head">
          <h2>{unread > 0 ? `${unread} unread` : "Mail"}</h2>
          <Badge source={live.mail.source} />
        </div>
        <MailList messages={live.mail.messages} error={live.mail.error} />
        <GoogleRow live={live} onDisconnect={onDisconnect} />
      </div>
    );
  }

  if (id === "calendar") {
    return (
      <div className="peek stack">
        <div className="peek-head">
          <h2>{face.longDate}</h2>
          <Badge source={live.calendar.source} />
        </div>
        <EventList events={live.calendar.events} error={live.calendar.error} />
        <GoogleRow live={live} onDisconnect={onDisconnect} />
      </div>
    );
  }

  if (id === "photos") {
    const google = googlePhotos.photos;
    return (
      <div className="peek stack">
        <div className="peek-head">
          <h2>Photos</h2>
          <span className={live.connected ? "badge live" : "badge"}>{live.connected ? "Google Photos" : "This device"}</span>
        </div>
        {google.length || photos.length ? (
          <div className="photo-grid peek-scroll">
            {google.map((photo) => (
              <img
                key={`${photo.sessionId}-${photo.id}`}
                src={`/api/photos/media?session=${encodeURIComponent(photo.sessionId)}&item=${encodeURIComponent(photo.id)}`}
                alt=""
              />
            ))}
            {photos.map((photo) => (
              <img key={photo.id} src={photo.url} alt="" />
            ))}
          </div>
        ) : (
          <p className="fine">
            {googlePhotos.error === "reconnect"
              ? "Connect Google again so Photos can open."
              : googlePhotos.picking
                ? "Pick the pictures in Google Photos. They land here when you finish."
                : live.connected
                  ? "Nothing chosen from Google Photos yet."
                  : "Choose pictures from Google Photos, or add one from this device."}
          </p>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            void onAddPhotos(event.target.files);
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
              Choose in Google Photos
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
          <button type="button" className="text-btn" onClick={() => fileRef.current?.click()}>
            Add from this device
          </button>
        </div>
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
          <em>{live.connected ? (live.account ?? "Connected") : "Mail, calendar, photos, and music"}</em>
        </span>
        {!live.ready ? (
          <span className="badge">…</span>
        ) : !live.googleConfigured ? (
          <span className="badge">Sample</span>
        ) : live.connected ? (
          <button type="button" className="text-btn" onClick={onDisconnect}>
            Disconnect
          </button>
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
        <li>Mail · {live.mail.source === "google" ? "Google" : "sample"}</li>
        <li>Calendar · {live.calendar.source === "google" ? "Google, today" : "sample"}</li>
        <li>Photos · {live.connected ? "Google Photos" : "this device"}</li>
        <li>Music · {live.connected ? "YouTube Music" : "sample"}</li>
        <li>Gemini · {geminiReady == null ? "checking" : geminiReady ? "ready" : "not connected on this copy"}</li>
        <li>Radio · live stations</li>
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
