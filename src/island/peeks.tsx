import { useRef, useState } from "react";
import type { CalendarEvent, IslandChat, IslandContact, IslandPhoto, LiveState, MailMessage } from "./desk.ts";
import { deliverText, formatWhen, useChats } from "./desk.ts";
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

  if (id === "messages") return <MessagesPeek />;

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
          <li>Messages · text to that number</li>
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

function messageWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function MessagesPeek() {
  const { chats, start, send } = useChats();
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = chats.find((chat) => chat.id === openId) ?? null;

  const deliver = async (to: string, text: string) => {
    setPending(true);
    setError(null);
    const result = await deliverText(to, text).catch(() => "failed" as const);
    setPending(false);
    if (result === "sent") return true;
    setError(result === "not_configured" ? "Connect a sender number before a text can leave." : "The text did not go out.");
    return false;
  };

  if (composing) {
    return (
      <form
        className="peek stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          void deliver(phone, draft).then((ok) => {
            if (!ok) return;
            const id = start(name, phone, draft);
            if (!id) return;
            setName("");
            setPhone("");
            setDraft("");
            setComposing(false);
            setOpenId(id);
          });
        }}
      >
        <div className="peek-head">
          <h2>New message</h2>
          <button type="button" className="text-btn" onClick={() => setComposing(false)}>
            Back
          </button>
        </div>
        <input
          className="chat-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
          aria-label="Name"
          maxLength={40}
        />
        <input
          className="chat-name"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="01000000000"
          aria-label="Phone number"
          inputMode="tel"
          maxLength={20}
        />
        <textarea
          className="chat-draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message"
          aria-label="Message"
          maxLength={500}
          rows={3}
        />
        <button type="submit" className="link-btn" disabled={pending}>
          Send
        </button>
        {error ? <p className="fine">{error}</p> : null}
      </form>
    );
  }

  if (open) {
    return (
      <ChatThread
        chat={open}
        draft={draft}
        pending={pending}
        error={error}
        onDraft={setDraft}
        onBack={() => {
          setError(null);
          setOpenId(null);
        }}
        onSend={async (id, text) => {
          const current = chats.find((chat) => chat.id === id);
          if (!current || !(await deliver(current.phone, text))) return;
          send(id, text);
          setDraft("");
        }}
      />
    );
  }

  return (
    <div className="peek stack">
      <div className="peek-head">
        <h2>Messages</h2>
        <span className="badge live">Island</span>
      </div>
      {chats.length ? (
        <ul className="peek-scroll rows">
          {chats.map((chat) => {
            const last = chat.messages.at(-1);
            return (
              <li key={chat.id}>
                <button type="button" className="row chat-row" onClick={() => setOpenId(chat.id)}>
                  <i className="dot on" />
                  <span>
                    <strong>{chat.name}</strong>
                    <em>{last?.text ?? "No message yet"}</em>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="fine">Send delivers the text to that number. This computer does not use a phone.</p>
      )}
      <button type="button" className="link-btn" onClick={() => setComposing(true)}>
        New message
      </button>
    </div>
  );
}

function ChatThread({
  chat,
  draft,
  pending,
  error,
  onDraft,
  onBack,
  onSend,
}: {
  chat: IslandChat;
  draft: string;
  pending: boolean;
  error: string | null;
  onDraft: (value: string) => void;
  onBack: () => void;
  onSend: (id: string, text: string) => void;
}) {
  return (
    <div className="peek stack">
      <div className="peek-head">
        <span>
          <h2>{chat.name}</h2>
          {chat.phone ? <p className="fine">{chat.phone}</p> : null}
        </span>
        <button type="button" className="text-btn" onClick={onBack}>
          Back
        </button>
      </div>
      <div className="thread peek-scroll">
        {chat.messages.map((message) => (
          <p key={message.id} className="bubble user">
            {message.text}
            <span className="bubble-time">{messageWhen(message.at)}</span>
          </p>
        ))}
      </div>
      <form
        className="ask"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          onSend(chat.id, draft);
        }}
      >
        <input
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          placeholder="Message"
          aria-label={`Message ${chat.name}`}
          maxLength={500}
        />
        <button type="submit" className="link-btn" disabled={pending}>
          Send
        </button>
      </form>
      {error ? <p className="fine">{error}</p> : null}
    </div>
  );
}
