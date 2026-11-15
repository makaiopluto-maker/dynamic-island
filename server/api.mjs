import { createHash, randomBytes } from "node:crypto";
import { getIdentity } from "../cursor/identity.ts";
import { dial } from "../shared/radio.mjs";
import { searchCatalog } from "../shared/youtube.ts";
import { sampleEvents, sampleMail, seoulDay } from "../shared/sample.mjs";
import { brightnessSupported, readBrightness, writeBrightness } from "./brightness.mjs";
import { releaseStatus } from "./release.mjs";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
  "https://www.googleapis.com/auth/photoslibrary.appendonly",
  "https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata",
  "https://www.googleapis.com/auth/youtube.readonly",
  "email",
].join(" ");

const cache = new Map();

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

function client() {
  const id = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  if (!id || !secret) return null;
  return { id, secret };
}

function readCookies(request) {
  const header = request.headers.get("cookie") ?? "";
  const cookies = {};
  for (const piece of header.split(";")) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function setCookie(name, value, { maxAge, secure }) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (maxAge != null) parts.push(`Max-Age=${maxAge}`);
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function clearCookie(name, secure) {
  return setCookie(name, "", { maxAge: 0, secure });
}

function secureRequest(request) {
  return new URL(request.url).protocol === "https:";
}

function json(body, { status = 200, cookies = [], cache = "private, no-store" } = {}) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": cache,
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function redirect(location, cookies) {
  const headers = new Headers({ location, "cache-control": "private, no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

function originOf(request) {
  return new URL(request.url).origin;
}

function callbackUrl(request) {
  return `${originOf(request)}/api/auth/google/callback`;
}

function sampleBundle(now) {
  return {
    ready: true,
    googleConfigured: googleConfigured(),
    connected: false,
    account: null,
    mail: { source: "sample", messages: sampleMail(now) },
    calendar: { source: "sample", events: sampleEvents(now) },
  };
}

async function googleFetch(url, token) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401) {
    const error = new Error("unauthorized");
    error.status = 401;
    throw error;
  }
  if (!response.ok) {
    const error = new Error("google");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function exchange(body) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const error = new Error("token");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function tokenCookies(tokens, secure) {
  const cookies = [
    setCookie("gi_at", tokens.access_token, { maxAge: tokens.expires_in ?? 3600, secure }),
  ];
  if (tokens.refresh_token) {
    cookies.push(setCookie("gi_rt", tokens.refresh_token, { maxAge: 60 * 60 * 24 * 30, secure }));
  }
  return cookies;
}

function cleared(secure) {
  return [clearCookie("gi_at", secure), clearCookie("gi_rt", secure), clearCookie("gi_state", secure)];
}

function decodeHeader(value) {
  return value.replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (whole, encoded) => {
    try {
      return Buffer.from(encoded, "base64").toString("utf8");
    } catch {
      return whole;
    }
  });
}

function senderName(from) {
  const decoded = decodeHeader(from);
  const named = decoded.match(/^\s*"?([^"<]+?)"?\s*</);
  const name = (named?.[1] ?? decoded).trim();
  return name || decoded;
}

async function fetchMail(token) {
  const list = await googleFetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=6&q=in:inbox",
    token,
  );
  const ids = (list.messages ?? []).map((message) => message.id).slice(0, 6);
  const messages = await Promise.all(
    ids.map(async (id) => {
      const detail = await googleFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        token,
      );
      const headers = detail.payload?.headers ?? [];
      const header = (name) => headers.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
      const date = header("Date");
      const parsed = Date.parse(date);
      return {
        id,
        from: senderName(header("From") || "Unknown"),
        subject: decodeHeader(header("Subject") || "(No subject)"),
        at: Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString(),
        unread: Array.isArray(detail.labelIds) && detail.labelIds.includes("UNREAD"),
      };
    }),
  );
  return messages;
}

async function fetchCalendar(token, now) {
  const day = seoulDay(now);
  const params = new URLSearchParams({
    timeMin: day.start,
    timeMax: day.end,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "8",
  });
  const data = await googleFetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    token,
  );
  return (data.items ?? []).map((event) => ({
    id: event.id,
    title: event.summary || "(No title)",
    start: event.start?.dateTime || event.start?.date || day.start,
    end: event.end?.dateTime || event.end?.date || day.end,
    allDay: Boolean(event.start?.date && !event.start?.dateTime),
  }));
}

function decodeBody(data) {
  return Buffer.from(String(data).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function collectText(part, found, depth = 0) {
  if (!part || depth > 8) return;
  if (typeof part.body?.data === "string" && part.body.data) {
    const text = decodeBody(part.body.data);
    if (part.mimeType === "text/plain" && !found.plain) found.plain = text;
    if (part.mimeType === "text/html" && !found.html) found.html = text;
  }
  for (const child of part.parts ?? []) collectText(child, found, depth + 1);
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function readMail(token, id) {
  const detail = await googleFetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`,
    token,
  );
  const headers = detail.payload?.headers ?? [];
  const header = (name) => headers.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
  const found = { plain: "", html: "" };
  collectText(detail.payload, found);
  const text = (found.plain.trim() || htmlToText(found.html) || detail.snippet || "").slice(0, 8000);
  return {
    id,
    from: senderName(header("From") || "Unknown"),
    subject: decodeHeader(header("Subject") || "(No subject)"),
    text,
  };
}

function encodeSubject(subject) {
  if (/^[\t\x20-\x7e]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function mailRaw({ to, subject, text }) {
  const message = [
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
  ].join("\r\n");
  return Buffer.from(message, "utf8").toString("base64url");
}

async function sendMail(token, message) {
  await googlePost("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", token, {
    raw: mailRaw(message),
  });
}

function clock(value) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

function minutes(value) {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

async function createEvent(token, event) {
  const day = seoulDay(new Date());
  const data = await googlePost("https://www.googleapis.com/calendar/v3/calendars/primary/events", token, {
    summary: event.title,
    start: { dateTime: `${day.ymd}T${event.start}:00+09:00`, timeZone: "Asia/Seoul" },
    end: { dateTime: `${day.ymd}T${event.end}:00+09:00`, timeZone: "Asia/Seoul" },
  });
  return {
    id: data.id,
    title: data.summary || event.title,
    start: data.start?.dateTime || `${day.ymd}T${event.start}:00+09:00`,
    end: data.end?.dateTime || `${day.ymd}T${event.end}:00+09:00`,
    allDay: false,
  };
}

async function googlePost(url, token, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error("google");
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new Error("google");
    error.status = response.status;
    throw error;
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function imageKind(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  const head = bytes.subarray(0, 12).toString("ascii");
  if (head.startsWith("GIF87a") || head.startsWith("GIF89a")) return "image/gif";
  if (head.startsWith("RIFF") && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

function photoName(value) {
  const base = String(value ?? "island.jpg").split(/[/\\]/).pop() ?? "island.jpg";
  const clean = base.replace(/[^\w.\- ()]/g, "").slice(0, 80);
  return clean || "island.jpg";
}

async function uploadPhoto(token, bytes, mime, filename) {
  const uploaded = await fetch("https://photoslibrary.googleapis.com/v1/uploads", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/octet-stream",
      "x-goog-upload-content-type": mime,
      "x-goog-upload-protocol": "raw",
    },
    body: bytes,
    signal: AbortSignal.timeout(20000),
  });
  if (uploaded.status === 401 || uploaded.status === 403) {
    const error = new Error("google");
    error.status = uploaded.status;
    throw error;
  }
  const uploadToken = (await uploaded.text()).trim();
  if (!uploaded.ok || !uploadToken) {
    const error = new Error("google");
    error.status = uploaded.status || 502;
    throw error;
  }
  const created = await googlePost("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate", token, {
    newMediaItems: [
      {
        description: "From the island",
        simpleMediaItem: { fileName: filename, uploadToken },
      },
    ],
  });
  const item = created.newMediaItemResults?.[0]?.mediaItem;
  const id = safeId(item?.id);
  if (!id) {
    const error = new Error("google");
    error.status = 502;
    throw error;
  }
  return { id };
}

async function listUploaded(token) {
  const data = await googleFetch("https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=12", token);
  return (data.mediaItems ?? [])
    .map((item) => {
      const id = safeId(item.id);
      const mime = typeof item.mimeType === "string" ? item.mimeType : "";
      if (!id || !mime.startsWith("image/")) return null;
      return id;
    })
    .filter(Boolean)
    .slice(0, 12);
}

function photoHost(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("googleusercontent.com");
  } catch {
    return false;
  }
}

async function imageBytes(baseUrl, token) {
  if (!photoHost(baseUrl)) return null;
  const image = await fetch(`${baseUrl}=w480-h480`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!image.ok) return null;
  const bytes = Buffer.from(await image.arrayBuffer());
  const type = image.headers.get("content-type") ?? "";
  if (bytes.length > 2_000_000 || !type.startsWith("image/")) return null;
  return { bytes, type };
}

async function fetchAccount(token) {
  const profile = await googleFetch("https://www.googleapis.com/oauth2/v2/userinfo", token);
  return typeof profile.email === "string" ? profile.email : null;
}

async function refreshAccess(refreshToken, credentials) {
  const tokens = await exchange({
    client_id: credentials.id,
    client_secret: credentials.secret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || refreshToken,
    expires_in: tokens.expires_in,
  };
}

async function loadConnected(access, refresh, credentials, now) {
  const attempt = async (token) => {
    const [mailResult, calendarResult, accountResult] = await Promise.allSettled([
      fetchMail(token),
      fetchCalendar(token, now),
      fetchAccount(token),
    ]);
    const unauthorized = [mailResult, calendarResult, accountResult].some(
      (result) => result.status === "rejected" && result.reason?.status === 401,
    );
    if (unauthorized) {
      const error = new Error("unauthorized");
      error.status = 401;
      throw error;
    }
    return {
      mail: mailResult.status === "fulfilled" ? mailResult.value : [],
      mailError: mailResult.status === "rejected",
      calendar: calendarResult.status === "fulfilled" ? calendarResult.value : [],
      calendarError: calendarResult.status === "rejected",
      account: accountResult.status === "fulfilled" ? accountResult.value : null,
    };
  };

  try {
    return { data: await attempt(access), tokens: null };
  } catch (error) {
    if (error.status !== 401 || !refresh) throw error;
    const tokens = await refreshAccess(refresh, credentials);
    return { data: await attempt(tokens.access_token), tokens };
  }
}

const photoLists = new Map();

function safeId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._~-]{6,300}$/.test(value) ? value : null;
}

function pickerUri(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".google.com")) return null;
    if (!url.pathname.endsWith("/autoclose")) url.pathname = `${url.pathname.replace(/\/$/, "")}/autoclose`;
    return url.toString();
  } catch {
    return null;
  }
}

function pollMs(session) {
  const raw = session.pollingConfig?.pollInterval ?? "3s";
  const seconds = Number(String(raw).replace(/s$/, ""));
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(8000, Math.max(2000, Math.round(seconds * 1000)));
}

async function createPhotoSession(token) {
  const response = await fetch("https://photospicker.googleapis.com/v1/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ pickingConfig: { maxItemCount: "8" } }),
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error("photos");
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new Error("photos");
    error.status = 502;
    throw error;
  }
  return response.json();
}

async function listPicked(token, sessionId) {
  const key = `${cacheKey(token)}:${sessionId}`;
  const hit = photoLists.get(key);
  if (hit && Date.now() - hit.at < 20_000) return hit.items;
  const data = await googleFetch(
    `https://photospicker.googleapis.com/v1/mediaItems?sessionId=${encodeURIComponent(sessionId)}&pageSize=8`,
    token,
  );
  const items = (data.mediaItems ?? [])
    .map((item) => {
      const file = item.mediaFile ?? {};
      const mime = typeof file.mimeType === "string" ? file.mimeType : "";
      const baseUrl = typeof file.baseUrl === "string" ? file.baseUrl : "";
      const id = safeId(item.id);
      if (!id || !mime.startsWith("image/") || !baseUrl.startsWith("https://")) return null;
      return { id, baseUrl, mime };
    })
    .filter(Boolean)
    .slice(0, 8);
  photoLists.set(key, { at: Date.now(), items });
  return items;
}

function cacheKey(token) {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

const geminiHits = new Map();

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  return Boolean(origin) && origin === new URL(request.url).origin;
}

function decodeXml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function videoId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
}

function playlistId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{2,80}$/.test(value) ? value : null;
}

function ytTrack(video, snippet) {
  const id = videoId(video);
  if (!id) return null;
  return {
    id,
    title: decodeXml(snippet?.title || "YouTube Music").slice(0, 140),
    artist: decodeXml(snippet?.channelTitle || "YouTube Music").slice(0, 80),
  };
}

async function youtubeSearch(token, q) {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10",
    videoEmbeddable: "true",
    maxResults: "8",
    q,
  });
  const data = await googleFetch(`https://www.googleapis.com/youtube/v3/search?${params}`, token);
  return (data.items ?? []).map((item) => ytTrack(item.id?.videoId, item.snippet)).filter(Boolean);
}

async function youtubePlaylistTracks(token, id) {
  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    maxResults: "12",
    playlistId: id,
  });
  const data = await googleFetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`, token);
  return (data.items ?? []).map((item) => ytTrack(item.contentDetails?.videoId, item.snippet)).filter(Boolean);
}

async function youtubeLibrary(token) {
  const [listsResult, channelResult] = await Promise.allSettled([
    googleFetch(
      "https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=6",
      token,
    ),
    googleFetch("https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true", token),
  ]);
  const denied = [listsResult, channelResult].find(
    (result) => result.status === "rejected" && (result.reason?.status === 401 || result.reason?.status === 403),
  );
  if (listsResult.status === "rejected" && (listsResult.reason?.status === 401 || listsResult.reason?.status === 403)) {
    throw listsResult.reason;
  }
  if (denied && listsResult.status === "rejected") throw denied.reason;
  const playlists = listsResult.status === "fulfilled"
    ? (listsResult.value.items ?? [])
        .map((item) => {
          const id = playlistId(item.id);
          if (!id) return null;
          return {
            id,
            title: decodeXml(item.snippet?.title || "Playlist").slice(0, 80),
            count: Number(item.contentDetails?.itemCount) || 0,
          };
        })
        .filter(Boolean)
    : [];
  const likes = channelResult.status === "fulfilled"
    ? playlistId(channelResult.value.items?.[0]?.contentDetails?.relatedPlaylists?.likes)
    : null;
  const rows = likes ? [{ id: likes, title: "Liked", count: 0 }, ...playlists.filter((item) => item.id !== likes)] : playlists;
  const first = rows[0];
  let tracks = [];
  if (first) {
    try {
      tracks = await youtubePlaylistTracks(token, first.id);
    } catch (error) {
      if (error?.status === 401) throw error;
      tracks = [];
    }
  }
  return { playlists: rows.slice(0, 6), tracks };
}

const youtubeHits = new Map();

async function youtubeRoute(request, credentials, cookies, run) {
  if (!sameOrigin(request)) return json({ error: "forbidden" }, { status: 403 });
  if (!credentials) return json({ error: "not_configured" }, { status: 404 });
  if (!cookies.gi_at) return json({ error: "reconnect" }, { status: 401 });
  if (youtubeLimited(request)) return json({ error: "limited" }, { status: 429 });
  try {
    return await run(cookies.gi_at);
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) return json({ error: "reconnect" }, { status: 401 });
    return json({ error: "unreachable" }, { status: 502 });
  }
}

function publicStream(value) {
  if (typeof value !== "string" || !value.startsWith("https://")) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host === "0.0.0.0") return null;
    if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function mapStation(item, progressive = false) {
  const url = publicStream(item?.url_resolved || item?.url);
  const name = typeof item?.name === "string" ? item.name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const id = typeof item?.stationuuid === "string" && /^[0-9a-f-]{16,40}$/i.test(item.stationuuid) ? item.stationuuid : "";
  if (!url || !name || !id) return null;
  if (progressive && /\.m3u8(\?|$)/i.test(url)) return null;
  const place = [item.countrycode, item.codec].filter((part) => typeof part === "string" && part.trim()).join(" · ");
  return { id, name, detail: place || "Live", url };
}

const MEDIA_HOSTS = ["gscdn.kbs.co.kr", "imbc.com", "sbs.co.kr", "cbs.co.kr", "ytn.co.kr", "nowcdn.co.kr", "tbs.seoul.kr"];

const FIXED_LIVE = {
  "945": "https://radiolive.ytn.co.kr/radio/_definst_/20211118_fmlive/playlist.m3u8",
  "951": "https://cdnfm.tbs.seoul.kr/tbs/_definst_/tbs_fm_web_360.smil/chunklist.m3u8",
  "981": "https://m-aac.cbs.co.kr/mweb_cbs981/_definst_/cbs981.stream/playlist.m3u8",
};

function mediaUrl(value) {
  if (typeof value !== "string") return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!MEDIA_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return null;
  if (!/\.(m3u8|aac|ts|m4s|mp3|mp4)$/i.test(url.pathname)) return null;
  return url;
}

function mediaHeaders(url) {
  const headers = { "user-agent": "Mozilla/5.0", accept: "*/*" };
  const host = url.hostname.toLowerCase();
  if (host.endsWith("kbs.co.kr")) headers.referer = "https://radio.kbs.co.kr/";
  else if (host.endsWith("imbc.com")) headers.referer = "https://mini.imbc.com/";
  else if (host.endsWith("sbs.co.kr")) headers.referer = "https://www.sbs.co.kr/";
  return headers;
}

function rewritePlaylist(text, base) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (match, uri) => {
          const next = mediaUrl(new URL(uri, base).toString());
          if (!next) return match;
          return `URI="/api/radio/seg?u=${encodeURIComponent(next.toString())}"`;
        });
      }
      const next = mediaUrl(new URL(trimmed, base).toString());
      if (!next) return "";
      return `/api/radio/seg?u=${encodeURIComponent(next.toString())}`;
    })
    .join("\n");
}

async function fetchMedia(target) {
  let current = target;
  for (let hop = 0; hop < 3; hop += 1) {
    const response = await fetch(current, {
      headers: mediaHeaders(new URL(current)),
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (response.status >= 300 && response.status < 400) {
      const next = mediaUrl(new URL(response.headers.get("location") ?? "", current).toString());
      if (!next) return null;
      current = next.toString();
      continue;
    }
    if (!response.ok) return null;
    const finalUrl = mediaUrl(response.url || current);
    if (!finalUrl) return null;
    return { response, url: finalUrl.toString() };
  }
  return null;
}

async function readSource(url) {
  const parsed = new URL(url);
  const allowed = parsed.protocol === "https:" && ["cfpwwwapi.kbs.co.kr", "sminiplay.imbc.com", "apis.sbs.co.kr"].includes(parsed.hostname);
  if (!allowed) return null;
  const response = await fetch(parsed, {
    headers: { "user-agent": "Mozilla/5.0", accept: "*/*" },
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  return response.text();
}

async function upstreamFor(id) {
  if (FIXED_LIVE[id]) return FIXED_LIVE[id];
  if (id === "973" || id === "891" || id === "931" || id === "1061") {
    const code = id === "973" ? "21" : id === "891" ? "25" : id === "931" ? "24" : "22";
    const text = await readSource(`https://cfpwwwapi.kbs.co.kr/api/v1/landing/live/channel_code/${code}`);
    if (!text) return null;
    const data = JSON.parse(text);
    return mediaUrl(data?.channel_item?.[0]?.service_url)?.toString() ?? null;
  }
  if (id === "919" || id === "959") {
    const channel = id === "919" ? "mfm" : "sfm";
    const text = await readSource(`https://sminiplay.imbc.com/aacplay.ashx?agent=webapp&channel=${channel}`);
    return mediaUrl(text?.trim())?.toString() ?? null;
  }
  if (id === "1035" || id === "1077") {
    const path = id === "1077" ? "powerpc/powerfm" : "lovepc/lovefm";
    const text = await readSource(`https://apis.sbs.co.kr/play-api/1.0/livestream/${path}?protocol=hls&ssl=Y`);
    return mediaUrl(text?.trim())?.toString() ?? null;
  }
  return null;
}

const mediaCache = new Map();

async function livePlaylist(id) {
  const cached = mediaCache.get(id);
  if (cached && Date.now() - cached.at < 45_000) {
    const got = await fetchMedia(cached.url);
    if (got) return { url: got.url, text: await got.response.text() };
    mediaCache.delete(id);
  }
  let start = await upstreamFor(id);
  if (!start) return null;
  let got = await fetchMedia(start);
  if (!got) return null;
  let text = await got.response.text();
  if (!text.startsWith("#EXT")) return null;
  if (text.includes("#EXT-X-STREAM-INF")) {
    const line = text.split(/\r?\n/).map((item) => item.trim()).find((item) => item && !item.startsWith("#"));
    const next = line ? mediaUrl(new URL(line, got.url).toString()) : null;
    if (!next) return null;
    got = await fetchMedia(next.toString());
    if (!got) return null;
    text = await got.response.text();
    if (!text.startsWith("#EXT") || text.includes("#EXT-X-STREAM-INF")) return null;
  }
  mediaCache.set(id, { url: got.url, at: Date.now() });
  return { url: got.url, text };
}

async function findStations(query, progressive = false) {
  const url = new URL("https://de1.api.radio-browser.info/json/stations/search");
  url.searchParams.set("name", query);
  url.searchParams.set("limit", "30");
  url.searchParams.set("hidebroken", "true");
  url.searchParams.set("order", "votes");
  url.searchParams.set("reverse", "true");
  const response = await fetch(url, {
    headers: { "user-agent": "dynamic-island/0.1" },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const error = new Error("radio");
    error.status = 502;
    throw error;
  }
  const data = await response.json();
  return (Array.isArray(data) ? data : []).filter(newsLike).map((item) => mapStation(item, progressive)).filter(Boolean);
}

function newsLike(item) {
  const name = String(item?.name ?? "").toLowerCase();
  const tags = String(item?.tags ?? "").toLowerCase();
  if (/음악|music fm|k-?pop|classic|cool fm|power fm|happy fm|gugak|fm4u|hip hop|jazz/.test(name)) return false;
  if (tags.includes("news") || tags.includes("뉴스") || name.includes("news") || name.includes("뉴스")) return true;
  return /ytn|표준fm|표준 fm|1라디오|1radio|교통방송|love fm|러브fm|러브 fm|한민족|arirang|연합뉴스|kbs 1|mbc 표준|sbs 러브|tbs/.test(name);
}

function youtubeLimited(request) {
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim() || "local";
  const now = Date.now();
  const recent = (youtubeHits.get(ip) ?? []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 30) return true;
  recent.push(now);
  youtubeHits.set(ip, recent);
  return false;
}

function geminiLimited(sub) {
  const now = Date.now();
  const recent = (geminiHits.get(sub) ?? []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 20) return true;
  recent.push(now);
  geminiHits.set(sub, recent);
  return false;
}

const writeHits = new Map();

function writeLimited(sub, bucket, limit) {
  const key = `${bucket}:${sub}`;
  const now = Date.now();
  const recent = (writeHits.get(key) ?? []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= limit) return true;
  recent.push(now);
  writeHits.set(key, recent);
  return false;
}

async function withGoogle(cookies, credentials, secure, run) {
  if (!cookies.gi_at) return json({ error: "reconnect" }, { status: 401 });
  const finish = (response, extra = []) => {
    for (const cookie of extra) response.headers.append("set-cookie", cookie);
    return response;
  };
  try {
    return finish(await run(cookies.gi_at));
  } catch (error) {
    if (error?.status === 401 && cookies.gi_rt && credentials) {
      try {
        const tokens = await refreshAccess(cookies.gi_rt, credentials);
        cache.delete(cacheKey(cookies.gi_at));
        return finish(await run(tokens.access_token), tokenCookies(tokens, secure));
      } catch (retry) {
        if (retry?.status === 401 || retry?.status === 403) {
          return json({ error: "reconnect" }, { status: 401, cookies: cleared(secure) });
        }
        return json({ error: "unreachable" }, { status: 502 });
      }
    }
    if (error?.status === 401 || error?.status === 403) return json({ error: "reconnect" }, { status: 401 });
    return json({ error: "unreachable" }, { status: 502 });
  }
}

async function requirePerson(request) {
  const identity = await getIdentity(request);
  if (!identity.verified || identity.kind !== "person") {
    return json({ error: "unauthorized" }, { status: 401 });
  }
  return identity;
}

function geminiReady() {
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

async function askGemini(messages) {
  const contents = messages.map((message) => ({
    role: message.role,
    parts: [{ text: message.text }],
  }));
  const models = ["gemini-3.5-flash", "gemini-2.5-flash"];
  let lastStatus = 502;
  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY.trim(),
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are Gemini inside a small glass panel called Dynamic Island. Reply in the user's language. Keep most answers under 80 words unless the user asks for more.",
              },
            ],
          },
          contents,
          generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    lastStatus = response.status;
    if (response.status === 404) continue;
    if (!response.ok) return { error: "unreachable", status: 502 };
    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (!text) return { error: "unreachable", status: 502 };
    return { text };
  }
  return { error: "unreachable", status: lastStatus === 404 ? 502 : lastStatus };
}

function cleanMessages(body) {
  if (!body || !Array.isArray(body.messages)) return null;
  const messages = body.messages.slice(-8).flatMap((message) => {
    if (!message || (message.role !== "user" && message.role !== "model")) return [];
    if (typeof message.text !== "string") return [];
    const text = message.text.trim().slice(0, 2000);
    if (!text) return [];
    return [{ role: message.role, text }];
  });
  if (!messages.length || messages.at(-1).role !== "user") return null;
  return messages;
}

export async function handleApi(request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  if (url.pathname === "/api/release" && request.method === "GET") {
    return json(await releaseStatus(), { cache: "no-store" });
  }
  const viewer = await requirePerson(request);
  if (viewer instanceof Response) return viewer;
  const now = new Date();
  const secure = secureRequest(request);
  const cookies = readCookies(request);
  const credentials = client();

  if (url.pathname === "/api/gemini" && request.method === "GET") {
    return json({ configured: geminiReady() });
  }

  if (url.pathname === "/api/gemini" && request.method === "POST") {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, { status: 403 });
    if (!geminiReady()) return json({ error: "not_configured" }, { status: 404 });
    if (geminiLimited(viewer.sub)) return json({ error: "busy" }, { status: 429 });
    const messages = cleanMessages(await request.json().catch(() => null));
    if (!messages) return json({ error: "bad_request" }, { status: 400 });
    try {
      const result = await askGemini(messages);
      if (result.error) return json({ error: result.error }, { status: result.status });
      return json({ text: result.text });
    } catch {
      return json({ error: "unreachable" }, { status: 502 });
    }
  }

  if (url.pathname === "/api/radio/live.m3u8" && request.method === "GET") {
    if (writeLimited(viewer.sub, "radio-live", 40)) return json({ error: "busy" }, { status: 429 });
    const station = dial.find((item) => item.id === url.searchParams.get("id"));
    if (!station) return json({ error: "bad_request" }, { status: 400 });
    try {
      const playlist = await livePlaylist(station.id);
      if (!playlist) return json({ error: "unreachable" }, { status: 502 });
      return new Response(rewritePlaylist(playlist.text, playlist.url), {
        headers: {
          "content-type": "application/vnd.apple.mpegurl",
          "cache-control": "no-store",
        },
      });
    } catch {
      return json({ error: "unreachable" }, { status: 502 });
    }
  }

  if (url.pathname === "/api/radio/seg" && request.method === "GET") {
    if (writeLimited(viewer.sub, "radio-seg", 180)) return json({ error: "busy" }, { status: 429 });
    const target = mediaUrl(url.searchParams.get("u") ?? "");
    if (!target) return json({ error: "bad_request" }, { status: 400 });
    try {
      const got = await fetchMedia(target.toString());
      if (!got) return json({ error: "unreachable" }, { status: 502 });
      if (got.url.includes(".m3u8")) {
        const text = await got.response.text();
        if (!text.startsWith("#EXT")) return json({ error: "unreachable" }, { status: 502 });
        return new Response(rewritePlaylist(text, got.url), {
          headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" },
        });
      }
      const type = got.response.headers.get("content-type") || (got.url.includes(".aac") ? "audio/aac" : "application/octet-stream");
      return new Response(got.response.body, {
        headers: { "content-type": type, "cache-control": "no-store" },
      });
    } catch {
      return json({ error: "unreachable" }, { status: 502 });
    }
  }

  if (url.pathname === "/api/radio/tune" && request.method === "GET") {
    const station = dial.find((item) => item.id === url.searchParams.get("id"));
    if (!station) return json({ error: "bad_request" }, { status: 400 });
    return json({ id: station.id, name: station.name, url: `/api/radio/live.m3u8?id=${station.id}` });
  }

  if (url.pathname === "/api/radio/search" && request.method === "GET") {
    if (writeLimited(viewer.sub, "radio", 30)) return json({ error: "busy" }, { status: 429 });
    const q = (url.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (q.length < 2) return json({ error: "bad_request" }, { status: 400 });
    try {
      const stations = (await findStations(q, true)).slice(0, 8);
      return json({ stations });
    } catch {
      return json({ error: "unreachable" }, { status: 502 });
    }
  }

  if (url.pathname === "/api/youtube/find" && request.method === "GET") {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, { status: 403 });
    if (youtubeLimited(request)) return json({ error: "limited" }, { status: 429 });
    const q = (url.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!q) return json({ error: "bad_request" }, { status: 400 });
    try {
      const tracks = await searchCatalog(q);
      if (!tracks.length) return json({ error: "unreachable" }, { status: 502 });
      return json({ tracks });
    } catch {
      return json({ error: "unreachable" }, { status: 502 });
    }
  }

  if (url.pathname === "/api/youtube/search" && request.method === "GET") {
    return youtubeRoute(request, credentials, cookies, async (token) => {
      const q = (url.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (!q) return json({ error: "bad_request" }, { status: 400 });
      return json({ tracks: await youtubeSearch(token, q) });
    });
  }

  if (url.pathname === "/api/youtube/library" && request.method === "GET") {
    return youtubeRoute(request, credentials, cookies, async (token) => json(await youtubeLibrary(token)));
  }

  if (url.pathname === "/api/youtube/playlist" && request.method === "GET") {
    return youtubeRoute(request, credentials, cookies, async (token) => {
      const id = playlistId(url.searchParams.get("id"));
      if (!id) return json({ error: "bad_request" }, { status: 400 });
      return json({ tracks: await youtubePlaylistTracks(token, id) });
    });
  }

  if (url.pathname === "/api/brightness" && request.method === "GET") {
    const level = await readBrightness();
    return json({ supported: brightnessSupported() && level != null, level });
  }

  if (url.pathname === "/api/brightness" && request.method === "POST") {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, { status: 403 });
    const body = await request.json().catch(() => null);
    const level = await writeBrightness(body?.level);
    return json({ supported: brightnessSupported() && level != null, level });
  }

  if (url.pathname === "/api/mail" && request.method === "GET") {
    if (!credentials) return json({ error: "not_configured" }, { status: 404 });
    const id = safeId(url.searchParams.get("id"));
    if (!id) return json({ error: "bad_request" }, { status: 400 });
    return withGoogle(cookies, credentials, secure, async (token) => json(await readMail(token, id)));
  }

  if (url.pathname === "/api/mail" && request.method === "POST") {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, { status: 403 });
    if (!credentials) return json({ error: "not_configured" }, { status: 404 });
    if (writeLimited(viewer.sub, "mail", 8)) return json({ error: "busy" }, { status: 429 });
    const body = await request.json().catch(() => null);
    const to = typeof body?.to === "string" ? body.to.trim() : "";
    const subject = typeof body?.subject === "string" ? body.subject.trim().slice(0, 200) : "";
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4000) : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 200 || /[\r\n]/.test(to) || /[\r\n]/.test(subject)) {
      return json({ error: "bad_request" }, { status: 400 });
    }
    if (!subject || !text) return json({ error: "bad_request" }, { status: 400 });
    return withGoogle(cookies, credentials, secure, async (token) => {
      await sendMail(token, { to, subject, text });
      cache.delete(cacheKey(token));
      return json({ ok: true });
    });
  }

  if (url.pathname === "/api/calendar" && request.method === "POST") {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, { status: 403 });
    if (!credentials) return json({ error: "not_configured" }, { status: 404 });
    if (writeLimited(viewer.sub, "calendar", 12)) return json({ error: "busy" }, { status: 429 });
    const body = await request.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 120) : "";
    const start = clock(body?.start);
    const end = clock(body?.end);
    if (!title || !start || !end || minutes(end) <= minutes(start)) return json({ error: "bad_request" }, { status: 400 });
    return withGoogle(cookies, credentials, secure, async (token) => {
      const event = await createEvent(token, { title, start, end });
      cache.delete(cacheKey(token));
      return json({ event });
    });
  }

  if (url.pathname === "/api/photos/library" && request.method === "GET") {
    if (!credentials) return json({ error: "not_configured" }, { status: 404 });
    return withGoogle(cookies, credentials, secure, async (token) => json({ items: await listUploaded(token) }));
  }

  if (url.pathname === "/api/photos/library/media" && request.method === "GET") {
    if (!credentials) return json({ error: "not_configured" }, { status: 404 });
    const id = safeId(url.searchParams.get("id"));
    if (!id) return json({ error: "bad_request" }, { status: 400 });
    return withGoogle(cookies, credentials, secure, async (token) => {
      const item = await googleFetch(
        `https://photoslibrary.googleapis.com/v1/mediaItems/${encodeURIComponent(id)}`,
        token,
      );
      const baseUrl = typeof item.baseUrl === "string" ? item.baseUrl : "";
      const image = await imageBytes(baseUrl, token);
      if (!image) return json({ error: "unreachable" }, { status: 502 });
      return new Response(image.bytes, {
        headers: { "content-type": image.type, "cache-control": "private, max-age=300" },
      });
    });
  }

  if (url.pathname === "/api/photos/upload" && request.method === "POST") {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, { status: 403 });
    if (!credentials) return json({ error: "not_configured" }, { status: 404 });
    if (writeLimited(viewer.sub, "photos", 6)) return json({ error: "busy" }, { status: 429 });
    const bytes = Buffer.from(await request.arrayBuffer());
    const mime = imageKind(bytes);
    if (!mime || bytes.length > 6_000_000) return json({ error: "bad_request" }, { status: 400 });
    const filename = photoName(request.headers.get("x-island-name"));
    return withGoogle(cookies, credentials, secure, (token) => uploadPhoto(token, bytes, mime, filename).then((item) => json(item)));
  }

  if (url.pathname === "/api/photos/session" && (request.method === "GET" || request.method === "POST")) {
    if (!credentials) return json({ error: "not_configured" }, { status: 404 });
    if (request.method === "POST" && !sameOrigin(request)) return json({ error: "forbidden" }, { status: 403 });
    if (!cookies.gi_at) return json({ error: "reconnect" }, { status: 401 });
    try {
      if (request.method === "POST") {
        const session = await createPhotoSession(cookies.gi_at);
        const uri = pickerUri(session.pickerUri);
        const id = safeId(session.id);
        if (!uri || !id) return json({ error: "unreachable" }, { status: 502 });
        return json({ id, pickerUri: uri, pollMs: pollMs(session) });
      }
      const id = safeId(url.searchParams.get("id"));
      if (!id) return json({ error: "bad_request" }, { status: 400 });
      const session = await googleFetch(`https://photospicker.googleapis.com/v1/sessions/${id}`, cookies.gi_at);
      const ready = Boolean(session.mediaItemsSet);
      const items = ready ? (await listPicked(cookies.gi_at, id)).map((item) => ({ id: item.id })) : [];
      return json({ id, mediaItemsSet: ready, pollMs: ready ? 0 : pollMs(session), items });
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) return json({ error: "reconnect" }, { status: 401 });
      return json({ error: "unreachable" }, { status: 502 });
    }
  }

  if (url.pathname === "/api/photos/media" && request.method === "GET") {
    if (!cookies.gi_at) return json({ error: "reconnect" }, { status: 401 });
    const sessionId = safeId(url.searchParams.get("session"));
    const itemId = safeId(url.searchParams.get("item"));
    if (!sessionId || !itemId) return json({ error: "bad_request" }, { status: 400 });
    try {
      const item = (await listPicked(cookies.gi_at, sessionId)).find((entry) => entry.id === itemId);
      if (!item) return json({ error: "not_found" }, { status: 404 });
      const image = await fetch(`${item.baseUrl}=w480-h480`, {
        headers: { authorization: `Bearer ${cookies.gi_at}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!image.ok) return json({ error: "unreachable" }, { status: 502 });
      const bytes = Buffer.from(await image.arrayBuffer());
      if (bytes.length > 2_000_000) return json({ error: "unreachable" }, { status: 502 });
      const type = image.headers.get("content-type") ?? item.mime;
      if (!type.startsWith("image/")) return json({ error: "unreachable" }, { status: 502 });
      return new Response(bytes, {
        headers: { "content-type": type, "cache-control": "private, max-age=300" },
      });
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) return json({ error: "reconnect" }, { status: 401 });
      return json({ error: "unreachable" }, { status: 502 });
    }
  }

  if (url.pathname === "/api/auth/google" && request.method === "GET") {
    if (!credentials) return json({ error: "not_configured" }, { status: 404 });
    const state = randomBytes(16).toString("hex");
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.searchParams.set("client_id", credentials.id);
    auth.searchParams.set("redirect_uri", callbackUrl(request));
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("scope", SCOPES);
    auth.searchParams.set("access_type", "offline");
    auth.searchParams.set("prompt", "consent");
    auth.searchParams.set("include_granted_scopes", "true");
    auth.searchParams.set("state", state);
    return redirect(auth.toString(), [setCookie("gi_state", state, { maxAge: 600, secure })]);
  }

  if (url.pathname === "/api/auth/google/callback" && request.method === "GET") {
    if (!credentials) return redirect("/?google=error", cleared(secure));
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    if (!state || state !== cookies.gi_state || !code) {
      return redirect("/?google=error", [clearCookie("gi_state", secure)]);
    }
    try {
      const tokens = await exchange({
        code,
        client_id: credentials.id,
        client_secret: credentials.secret,
        redirect_uri: callbackUrl(request),
        grant_type: "authorization_code",
      });
      return redirect("/?open=mail", [
        clearCookie("gi_state", secure),
        ...tokenCookies(tokens, secure),
      ]);
    } catch {
      return redirect("/?google=error", cleared(secure));
    }
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    return json({ ok: true }, { cookies: cleared(secure) });
  }

  if (url.pathname === "/api/live" && request.method === "GET") {
    if (!credentials || !cookies.gi_at) return json(sampleBundle(now));
    const key = cacheKey(cookies.gi_at);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 20_000) return json(hit.body);

    try {
      const loaded = await loadConnected(cookies.gi_at, cookies.gi_rt, credentials, now);
      const body = {
        ready: true,
        googleConfigured: true,
        connected: true,
        account: loaded.data.account,
        mail: {
          source: "google",
          messages: loaded.data.mail,
          ...(loaded.data.mailError ? { error: "unreachable" } : {}),
        },
        calendar: {
          source: "google",
          events: loaded.data.calendar,
          ...(loaded.data.calendarError ? { error: "unreachable" } : {}),
        },
      };
      cache.set(key, { at: Date.now(), body });
      const extra = loaded.tokens ? tokenCookies(loaded.tokens, secure) : [];
      return json(body, { cookies: extra });
    } catch (error) {
      if (error?.status === 401) return json(sampleBundle(now), { cookies: cleared(secure) });
      return json({
        ready: true,
        googleConfigured: true,
        connected: true,
        account: null,
        mail: { source: "google", messages: [], error: "unreachable" },
        calendar: { source: "google", events: [], error: "unreachable" },
      });
    }
  }

  return json({ error: "not_found" }, { status: 404 });
}

function readBody(req, max = 32_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > max) {
        reject(new Error("too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function toWebRequest(req) {
  const path = String(req.url ?? "/").split("?")[0];
  const max = path === "/api/photos/upload" ? 6_500_000 : 32_000;
  const forwarded = req.headers["x-forwarded-proto"];
  const proto = String(Array.isArray(forwarded) ? forwarded[0] : forwarded ?? "http")
    .split(",")[0]
    .trim();
  const hostHeader = req.headers.host;
  const host = String(Array.isArray(hostHeader) ? hostHeader[0] : hostHeader ?? "127.0.0.1:4731");
  const url = new URL(req.url ?? "/", `${proto}://${host}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else headers.set(key, value);
  }
  const method = req.method ?? "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req, max);
  return new Request(url, { method, headers, body: body?.length ? body : undefined });
}

export async function writeNodeResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    res.setHeader(key, value);
  });
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  if (cookies.length) res.setHeader("set-cookie", cookies);
  const bytes = Buffer.from(await response.arrayBuffer());
  res.end(bytes);
}
