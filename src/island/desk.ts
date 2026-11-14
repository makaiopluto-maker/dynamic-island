import { useCallback, useEffect, useState } from "react";
import { sampleEvents, sampleMail } from "../../shared/sample.mjs";
import type { CalendarEvent, MailMessage } from "../../shared/sample.mjs";

export type { CalendarEvent, MailMessage };

export type LiveState = {
  ready: boolean;
  googleConfigured: boolean;
  connected: boolean;
  account: string | null;
  mail: { source: "google" | "sample"; messages: MailMessage[]; error?: string };
  calendar: { source: "google" | "sample"; events: CalendarEvent[]; error?: string };
};

function offline(now: Date): LiveState {
  return {
    ready: true,
    googleConfigured: false,
    connected: false,
    account: null,
    mail: { source: "sample", messages: sampleMail(now) },
    calendar: { source: "sample", events: sampleEvents(now) },
  };
}

export function useLive() {
  const [live, setLive] = useState<LiveState>(() => ({
    ready: false,
    googleConfigured: false,
    connected: false,
    account: null,
    mail: { source: "sample", messages: [] },
    calendar: { source: "sample", events: [] },
  }));

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/live");
      if (!response.ok) throw new Error("live");
      const body = (await response.json()) as LiveState;
      setLive({ ...body, ready: true });
      const unread = body.mail.messages.filter((message) => message.unread).length;
      if (body.mail.source === "google" && unread > 0) {
        const seen = sessionStorage.getItem("island-unread");
        if (seen !== String(unread)) {
          sessionStorage.setItem("island-unread", String(unread));
          if (seen !== null) islandNotify("Mail", `${unread} unread on the island`);
        }
      }
    } catch {
      setLive(offline(new Date()));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    const id = window.setInterval(() => {
      void reload();
    }, 60_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(id);
    };
  }, [reload]);

  const disconnect = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    sessionStorage.removeItem("island-unread");
    await reload();
  }, [reload]);

  return { live, disconnect };
}

export function useWeather() {
  const [celsius, setCelsius] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current=temperature_2m&timezone=Asia%2FSeoul",
      { signal: controller.signal },
    )
      .then((response) => response.json())
      .then((body: { current?: { temperature_2m?: number } }) => {
        const value = body.current?.temperature_2m;
        if (typeof value === "number") setCelsius(Math.round(value));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });
    return () => controller.abort();
  }, []);
  return celsius;
}

export type IslandPhoto = { id: string; url: string };
export type IslandContact = { name: string; tel: string };
export type IslandNotice = { id: string; title: string; body: string; at: number };

const PHOTO_DB = "island-desk";
const PHOTO_STORE = "photos";

function openPhotos(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PHOTO_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function usePhotos() {
  const [photos, setPhotos] = useState<IslandPhoto[]>([]);

  const refresh = useCallback(async () => {
    const db = await openPhotos();
    const rows = await new Promise<Array<{ id: string; blob: Blob; created: number }>>((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readonly");
      const request = tx.objectStore(PHOTO_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    rows.sort((a, b) => b.created - a.created);
    setPhotos((current) => {
      current.forEach((photo) => URL.revokeObjectURL(photo.url));
      return rows.slice(0, 8).map((row) => ({ id: row.id, url: URL.createObjectURL(row.blob) }));
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const add = useCallback(
    async (files: FileList | null) => {
      const chosen = Array.from(files ?? [])
        .filter((file) => file.type.startsWith("image/") && file.size <= 8_000_000)
        .slice(0, 8);
      if (!chosen.length) return;
      const db = await openPhotos();
      const tx = db.transaction(PHOTO_STORE, "readwrite");
      const store = tx.objectStore(PHOTO_STORE);
      chosen.forEach((file, index) => {
        store.put({ id: `${Date.now()}-${index}-${file.name}`, blob: file, created: Date.now() + index });
      });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      await refresh();
    },
    [refresh],
  );

  return { photos, add };
}

const CONTACT_KEY = "island-contacts";

type ContactPicker = {
  select: (
    props: string[],
    options: { multiple: boolean },
  ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
};

function contactPicker() {
  const nav = navigator as Navigator & { contacts?: ContactPicker };
  return nav.contacts ?? null;
}

export function contactsSupported() {
  return contactPicker() != null;
}

export function useContacts() {
  const [contacts, setContacts] = useState<IslandContact[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(CONTACT_KEY) ?? "[]") as IslandContact[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const pick = useCallback(async () => {
    const picker = contactPicker();
    if (!picker) return;
    const chosen = await picker.select(["name", "tel"], { multiple: true });
    const next = chosen
      .map((contact) => ({
        name: contact.name?.[0] || "Unnamed",
        tel: contact.tel?.[0] || "",
      }))
      .filter((contact) => contact.tel);
    localStorage.setItem(CONTACT_KEY, JSON.stringify(next));
    setContacts(next);
  }, []);

  return { contacts, pick, supported: contactsSupported() };
}

const CHAT_KEY = "island-chats";

export type IslandChatMessage = { id: string; text: string; at: string };
export type IslandChat = { id: string; name: string; phone: string; messages: IslandChatMessage[] };

export function smsAddress(raw: string) {
  const compact = raw.replace(/[^\d+]/g, "");
  if (compact.startsWith("+")) return compact.slice(0, 16);
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 8) return "";
  if (digits.startsWith("0")) return `+82${digits.slice(1)}`.slice(0, 16);
  return digits.slice(0, 16);
}

export function smsHref(phone: string, body: string) {
  const address = smsAddress(phone);
  const text = body.trim();
  if (!address || !text) return "";
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return `sms:${address}${ios ? "&" : "?"}body=${encodeURIComponent(text)}`;
}

export function openText(phone: string, body: string) {
  const href = smsHref(phone, body);
  if (!href) return;
  const link = document.createElement("a");
  link.href = href;
  document.body.append(link);
  link.click();
  link.remove();
}

function readChats(): IslandChat[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_KEY) ?? "[]") as IslandChat[];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((chat) => {
      if (typeof chat?.id !== "string" || typeof chat?.name !== "string" || !Array.isArray(chat.messages)) return [];
      return [{ ...chat, phone: typeof chat.phone === "string" ? chat.phone : "" }];
    });
  } catch {
    return [];
  }
}

export function useChats() {
  const [chats, setChats] = useState<IslandChat[]>(() => readChats());

  const write = useCallback((next: IslandChat[]) => {
    localStorage.setItem(CHAT_KEY, JSON.stringify(next));
    setChats(next);
  }, []);

  const start = useCallback(
    (name: string, phone: string, text: string) => {
      const title = name.trim().slice(0, 40);
      const address = smsAddress(phone);
      const body = text.trim().slice(0, 500);
      if (!title || !address || !body) return null;
      const chat: IslandChat = {
        id: crypto.randomUUID(),
        name: title,
        phone: address,
        messages: [{ id: crypto.randomUUID(), text: body, at: new Date().toISOString() }],
      };
      write([chat, ...readChats()].slice(0, 30));
      openText(address, body);
      return chat.id;
    },
    [write],
  );

  const send = useCallback(
    (id: string, text: string) => {
      const body = text.trim().slice(0, 500);
      if (!body) return;
      const next = readChats().map((chat) =>
        chat.id === id
          ? {
              ...chat,
              messages: [...chat.messages, { id: crypto.randomUUID(), text: body, at: new Date().toISOString() }].slice(-80),
            }
          : chat,
      );
      const current = next.find((chat) => chat.id === id);
      write(current ? [current, ...next.filter((chat) => chat.id !== id)] : next);
      if (current?.phone) openText(current.phone, body);
    },
    [write],
  );

  return { chats, start, send };
}

const NOTICE_KEY = "island-notices";

export function readNotices(): IslandNotice[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTICE_KEY) ?? "[]") as IslandNotice[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushNotice(notice: IslandNotice) {
  const next = [notice, ...readNotices().filter((item) => item.id !== notice.id)].slice(0, 6);
  localStorage.setItem(NOTICE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("island-notice"));
  return next;
}

export function useNotices() {
  const [notices, setNotices] = useState<IslandNotice[]>(() => readNotices());
  useEffect(() => {
    const onNotice = () => setNotices(readNotices());
    window.addEventListener("island-notice", onNotice);
    return () => window.removeEventListener("island-notice", onNotice);
  }, []);
  return notices;
}

export function islandNotify(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch {
    /* The browser refused the notice. The island still shows it. */
  }
}

export function askNotify() {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  void Notification.requestPermission();
}

export function soonEvent(events: CalendarEvent[], now: Date) {
  const time = now.getTime();
  return (
    events.find((event) => {
      const start = new Date(event.start).getTime();
      const end = new Date(event.end).getTime();
      return end > time && start - time < 45 * 60_000;
    }) ?? null
  );
}

export function formatWhen(iso: string, allDay: boolean) {
  if (allDay) return "All day";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
