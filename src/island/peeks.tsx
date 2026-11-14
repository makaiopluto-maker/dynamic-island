import { useRef, useState } from "react";
import type { CalendarEvent, IslandContact, IslandNotice, IslandPhoto, LiveState, MailMessage } from "./desk.ts";
import { formatWhen } from "./desk.ts";
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
  photos,
  contacts,
  notices,
  contactsSupported,
  brightness,
  onBrightness,
  onAddPhotos,
  onPickContacts,
  onDisconnect,
}: {
  id: PeekId;
  now: Date;
  live: LiveState;
  photos: IslandPhoto[];
  contacts: IslandContact[];
  notices: IslandNotice[];
  contactsSupported: boolean;
  brightness: { level: number | null; supported: boolean };
  onBrightness: (level: number) => void;
  onAddPhotos: (files: FileList | null) => void;
  onPickContacts: () => void;
  onDisconnect: () => void;
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

  if (id === "messages") {
    return (
      <div className="peek stack">
        <div className="peek-head">
          <h2>Messages</h2>
          <span className="badge">On device</span>
        </div>
        <p className="fine">Texts stay on the phone. Alerts from the island land here.</p>
        <ul className="peek-scroll rows">
          {notices.map((notice) => (
            <li key={notice.id} className="row">
              <i className="dot on" />
              <span>
                <strong>{notice.title}</strong>
                <em>{notice.body}</em>
              </span>
            </li>
          ))}
          {contacts.map((contact) => (
            <li key={`sms-${contact.tel}`} className="row">
              <i className="dot" />
              <span>
                <strong>{contact.name}</strong>
                <a href={`sms:${contact.tel}`}>Text {contact.name}</a>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (id === "plus") {
    return (
      <div className="peek stack">
        <div className="peek-head">
          <h2>Connected</h2>
        </div>
        <ul className="peek-scroll rows plain">
          <li>Weather · Seoul, live</li>
          <li>Mail · {live.connected ? live.account ?? "Google" : "sample until Google connects"}</li>
          <li>Calendar · {live.calendar.source === "google" ? "Google, today" : "sample until Google connects"}</li>
          <li>Photos · {live.connected ? "Google Photos" : "this device until Google connects"}</li>
          <li>Phone · {contactsSupported ? "contacts" : "not in this browser"}</li>
          <li>Music · {live.connected ? "YouTube Music" : "sample until Google connects"}</li>
          <li>Radio · live stations</li>
          <li>Gemini · in this island</li>
          <li>Lights · {brightness.supported ? "this monitor" : "the Windows app on this PC"}</li>
        </ul>
      </div>
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
