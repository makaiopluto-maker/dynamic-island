const SEOUL = "Asia/Seoul";

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((item) => item.type === type)?.value ?? "";
}

export function seoulFace(now: Date, celsius?: number | null) {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEOUL,
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).formatToParts(now);
  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: SEOUL,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(now);

  const weekday = part(dateParts, "weekday").replace(".", "").toUpperCase();
  const day = part(dateParts, "day");
  const month = part(dateParts, "month").replace(".", "").toUpperCase();
  const hour = part(timeParts, "hour");
  const minute = part(timeParts, "minute");
  const dayPeriod = part(timeParts, "dayPeriod").toUpperCase();

  return {
    dateLine: `${weekday} ${day} ${month} / ${celsius == null ? "…" : `${celsius}°`}`,
    timeLine: `${hour}:${minute} ${dayPeriod}`,
    ymd: new Intl.DateTimeFormat("en-CA", {
      timeZone: SEOUL,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
    longDate: new Intl.DateTimeFormat("en-US", {
      timeZone: SEOUL,
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(now),
  };
}

export function formatDoneAt(when: Date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SEOUL,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(when);
}

export function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatElapsed(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe < 60) return String(safe);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatRemaining(totalSeconds: number) {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `-${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function mastHeight(viewportHeight: number) {
  return Math.round(Math.min(260, Math.max(148, viewportHeight * 0.26)));
}
