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

export type IslandHour = { label: string; celsius: number };

export type IslandWeather = {
  celsius: number;
  summary: string;
  high: number;
  low: number;
  hours: IslandHour[];
};

type Forecast = {
  current?: { temperature_2m?: number; weather_code?: number };
  hourly?: { time?: string[]; temperature_2m?: number[] };
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
};

function weatherSummary(code: number) {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Storm";
  return "Seoul";
}

function readForecast(body: Forecast): IslandWeather | null {
  const temp = body.current?.temperature_2m;
  const code = body.current?.weather_code;
  const high = body.daily?.temperature_2m_max?.[0];
  const low = body.daily?.temperature_2m_min?.[0];
  const times = body.hourly?.time ?? [];
  const temps = body.hourly?.temperature_2m ?? [];
  if (typeof temp !== "number" || typeof code !== "number" || typeof high !== "number" || typeof low !== "number") {
    return null;
  }
  const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(" ", "T").slice(0, 13);
  const index = times.findIndex((time) => time.slice(0, 13) >= stamp);
  const start = index < 0 ? 0 : index;
  const hours = times.slice(start, start + 6).flatMap((time, offset) => {
    const value = temps[start + offset];
    if (typeof value !== "number") return [];
    return [{ label: time.slice(11, 13), celsius: Math.round(value) }];
  });
  return {
    celsius: Math.round(temp),
    summary: weatherSummary(code),
    high: Math.round(high),
    low: Math.round(low),
    hours,
  };
}

export function useWeather() {
  const [current, setCurrent] = useState<IslandWeather | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current=temperature_2m,weather_code&hourly=temperature_2m&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FSeoul&forecast_days=2",
      )
        .then((response) => {
          if (!response.ok) throw new Error("weather");
          return response.json() as Promise<Forecast>;
        })
        .then((body) => {
          if (!active) return;
          const next = readForecast(body);
          if (!next) {
            setFailed(true);
            return;
          }
          setCurrent(next);
          setFailed(false);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    };
    load();
    const id = window.setInterval(load, 15 * 60_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  return { current, failed };
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
