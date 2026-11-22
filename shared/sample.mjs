const SEOUL = "Asia/Seoul";

export function seoulDay(now, ymd) {
  const day =
    typeof ymd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ymd)
      ? ymd
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: SEOUL,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(now);
  return {
    ymd: day,
    start: `${day}T00:00:00+09:00`,
    end: `${day}T23:59:59+09:00`,
  };
}

export function sampleMail(now) {
  const at = (hoursAgo) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
  return [
    {
      id: "sample-glass",
      from: "Glass shop",
      subject: "The island build is ready for a look",
      text: "The glass is set. Open the island from the desk and look through the room before the light moves on.",
      at: at(1),
      unread: true,
    },
    {
      id: "sample-tide",
      from: "Tide Club",
      subject: "Blue Hours is on the desk",
      text: "Blue Hours is queued on the desk. Play it from the island when the room goes quiet.",
      at: at(5),
      unread: false,
    },
    {
      id: "sample-window",
      from: "North Window",
      subject: "Light hits the room late today",
      text: "The north window keeps the room dim until late. The lamp by the sofa is enough until then.",
      at: at(26),
      unread: false,
    },
  ];
}

export function sampleEvents(now) {
  const { ymd } = seoulDay(now);
  return [
    {
      id: "sample-ship",
      title: "Ship the island",
      start: `${ymd}T09:00:00+09:00`,
      end: `${ymd}T10:30:00+09:00`,
      allDay: false,
    },
    {
      id: "sample-light",
      title: "Light check",
      start: `${ymd}T16:00:00+09:00`,
      end: `${ymd}T16:30:00+09:00`,
      allDay: false,
    },
  ];
}
