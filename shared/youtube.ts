const fallbackHosts = ["yt.chocolatemoo53.com"];

export type CatalogTrack = { id: string; title: string; artist: string };

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

function mapTracks(data: unknown): CatalogTrack[] {
  if (!Array.isArray(data)) return [];
  const tracks: CatalogTrack[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const row = item as { type?: unknown; videoId?: unknown; title?: unknown; author?: unknown };
    if (row.type !== "video") continue;
    const id = videoId(row.videoId);
    if (!id) continue;
    tracks.push({
      id,
      title: clean(row.title, "YouTube Music", 140),
      artist: clean(row.author, "YouTube Music", 80),
    });
    if (tracks.length >= 8) break;
  }
  return tracks;
}

function hostName(value: unknown) {
  return typeof value === "string" && /^[a-z0-9.-]{1,120}$/i.test(value) ? value.toLowerCase() : "";
}

async function catalogHosts(fetchImpl: typeof fetch) {
  try {
    const response = await fetchImpl("https://api.invidious.io/instances.json?sort_by=health", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return fallbackHosts;
    const data: unknown = await response.json();
    const hosts: string[] = [];
    for (const item of Array.isArray(data) ? data : []) {
      if (!Array.isArray(item)) continue;
      const domain = hostName(item[0]);
      const info = item[1] as { type?: unknown; api?: unknown; cors?: unknown } | null;
      if (!domain || !info || info.type !== "https" || !info.api || info.cors !== true) continue;
      hosts.push(domain);
      if (hosts.length >= 4) break;
    }
    return hosts.length ? hosts : fallbackHosts;
  } catch {
    return fallbackHosts;
  }
}

export async function searchCatalog(query: string, fetchImpl: typeof fetch = fetch) {
  const q = clean(query, "", 80);
  if (q.length < 1) return [];
  const hosts = await catalogHosts(fetchImpl);
  for (const host of hosts) {
    try {
      const response = await fetchImpl(
        `https://${host}/api/v1/search?q=${encodeURIComponent(q)}&type=video`,
        { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) continue;
      const tracks = mapTracks(await response.json());
      if (tracks.length) return tracks;
    } catch {
      /* Try the next catalog. */
    }
  }
  return [];
}
