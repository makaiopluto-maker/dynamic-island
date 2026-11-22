const pipedHosts = ["api.piped.private.coffee", "pipedapi.darkn.bio"];
const invidiousHosts = ["yt.chocolatemoo53.com"];

export type CatalogTrack = { id: string; title: string; artist: string };

export const starterTracks: CatalogTrack[] = [
  { id: "n7ePZLn9_lQ", title: "Super Shy", artist: "NewJeans" },
  { id: "ghrlZIMDzbM", title: "Hype Boy", artist: "NewJeans" },
  { id: "V6TEcoNUmc8", title: "Ditto", artist: "NewJeans" },
  { id: "2Kff0U8w-aU", title: "OMG", artist: "NewJeans" },
  { id: "vrM2mrI83uk", title: "How Sweet", artist: "NewJeans" },
  { id: "HBqH4uJS0PU", title: "Magnetic", artist: "ILLIT" },
  { id: "Gqfq_8jPw8Q", title: "Perfect Night", artist: "LE SSERAFIM" },
  { id: "DiTd771WumE", title: "APT.", artist: "ROSÉ & Bruno Mars" },
  { id: "jWQx2f-CErU", title: "Whiplash", artist: "aespa" },
  { id: "phuiiNCxRMg", title: "Supernova", artist: "aespa" },
  { id: "fx227oTnnPc", title: "Love Lee", artist: "AKMU" },
  { id: "j1uXcHwLhHM", title: "사건의 지평선", artist: "Younha" },
];

export function videoId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
}

export function videoFromLink(value: string) {
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return videoId(url.pathname.split("/").filter(Boolean)[0]);
    if (host === "youtube.com" || host === "music.youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      return videoId(url.searchParams.get("v"));
    }
  } catch {
    return null;
  }
  return null;
}

function clean(value: unknown, fallback: string, max: number) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return (text || fallback).slice(0, max);
}

function songLength(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : 0;
}

function isMix(title: string) {
  return /mix|playlist|compilation|top hits|top songs|hour|노래모음|모음집|nonstop|megamix/i.test(title);
}

function mapInvidious(data: unknown): CatalogTrack[] {
  if (!Array.isArray(data)) return [];
  const tracks: CatalogTrack[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as { type?: unknown; videoId?: unknown; title?: unknown; author?: unknown; lengthSeconds?: unknown };
    if (row.type !== "video") continue;
    const id = videoId(row.videoId);
    if (!id) continue;
    const title = clean(row.title, "YouTube Music", 140);
    if (isMix(title)) continue;
    const seconds = songLength(row.lengthSeconds);
    if (seconds > 0 && (seconds < 60 || seconds > 480)) continue;
    tracks.push({ id, title, artist: clean(row.author, "YouTube Music", 80) });
    if (tracks.length >= 12) break;
  }
  return tracks;
}

function mapPiped(data: unknown): CatalogTrack[] {
  if (!data || typeof data !== "object") return [];
  const items = (data as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const tracks: CatalogTrack[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as { type?: unknown; url?: unknown; title?: unknown; uploaderName?: unknown; duration?: unknown };
    if (row.type !== "stream") continue;
    const match = String(row.url ?? "").match(/[?&]v=([A-Za-z0-9_-]{11})|\/watch\/([A-Za-z0-9_-]{11})|\/([A-Za-z0-9_-]{11})$/);
    const id = videoId(match?.[1] || match?.[2] || match?.[3]);
    if (!id) continue;
    const title = clean(row.title, "YouTube Music", 140);
    if (isMix(title)) continue;
    const seconds = songLength(row.duration);
    if (seconds > 0 && (seconds < 60 || seconds > 480)) continue;
    tracks.push({ id, title, artist: clean(row.uploaderName, "YouTube Music", 80) });
    if (tracks.length >= 12) break;
  }
  return tracks;
}

function localMatches(query: string) {
  const needle = query.toLowerCase();
  return starterTracks.filter((track) => `${track.title} ${track.artist}`.toLowerCase().includes(needle)).slice(0, 12);
}

async function searchPiped(query: string, fetchImpl: typeof fetch) {
  for (const host of pipedHosts) {
    try {
      const response = await fetchImpl(`https://${host}/search?q=${encodeURIComponent(query)}&filter=music_songs`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) continue;
      const tracks = mapPiped(await response.json());
      if (tracks.length) return tracks;
    } catch {
      /* Try the next catalog. */
    }
  }
  return [];
}

async function searchInvidious(query: string, fetchImpl: typeof fetch) {
  for (const host of invidiousHosts) {
    try {
      const response = await fetchImpl(`https://${host}/api/v1/search?q=${encodeURIComponent(query)}&type=video`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) continue;
      const tracks = mapInvidious(await response.json());
      if (tracks.length) return tracks;
    } catch {
      /* Try the next catalog. */
    }
  }
  return [];
}

export async function searchCatalog(query: string, fetchImpl: typeof fetch = fetch) {
  const q = clean(query, "", 80);
  if (q.length < 1) return [];
  const piped = await searchPiped(q, fetchImpl);
  if (piped.length) return piped;
  const invidious = await searchInvidious(q, fetchImpl);
  if (invidious.length) return invidious;
  return localMatches(q);
}
