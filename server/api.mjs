import { createHash, createHmac, randomBytes } from "node:crypto";
import { getIdentity } from "../cursor/identity.ts";
import { sampleEvents, sampleMail, seoulDay } from "../shared/sample.mjs";
import { brightnessSupported, readBrightness, writeBrightness } from "./brightness.mjs";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
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

function json(body, { status = 200, cookies = [] } = {}) {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "private, no-store",
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

const smsHits = new Map();

function smsReady() {
  return Boolean(process.env.SOLAPI_API_KEY?.trim() && process.env.SOLAPI_API_SECRET?.trim() && process.env.SOLAPI_SENDER?.trim());
}

function smsLimited(sub) {
  const now = Date.now();
  const recent = (smsHits.get(sub) ?? []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 8) return true;
  recent.push(now);
  smsHits.set(sub, recent);
  return false;
}

function recipientDigits(raw) {
  const compact = String(raw ?? "").replace(/[^\d+]/g, "");
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  if (compact.startsWith("+82") || (digits.startsWith("82") && digits.length >= 11)) return `0${digits.slice(2)}`;
  return digits;
}

function solapiAuth() {
  const date = new Date().toISOString();
  const salt = randomBytes(16).toString("hex");
  const signature = createHmac("sha256", process.env.SOLAPI_API_SECRET.trim()).update(date + salt).digest("hex");
  return `HMAC-SHA256 apiKey=${process.env.SOLAPI_API_KEY.trim()}, date=${date}, salt=${salt}, signature=${signature}`;
}

async function sendSolapi(to, text) {
  const from = (process.env.SOLAPI_SENDER ?? "").replace(/\D/g, "");
  if (!from) return { error: "not_configured", status: 404 };
  const response = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      authorization: solapiAuth(),
      "content-type": "application/json",
    },
    body: JSON.stringify({ message: { to, from, text, autoTypeDetect: true } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return { error: "unreachable", status: 502 };
  return { ok: true };
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
  const viewer = await requirePerson(request);
  if (viewer instanceof Response) return viewer;
  const now = new Date();
  const secure = secureRequest(request);
  const cookies = readCookies(request);
  const credentials = client();

  if (url.pathname === "/api/sms" && request.method === "POST") {
    if (!sameOrigin(request)) return json({ error: "forbidden" }, { status: 403 });
    if (!smsReady()) return json({ error: "not_configured" }, { status: 404 });
    if (smsLimited(viewer.sub)) return json({ error: "busy" }, { status: 429 });
    const body = await request.json().catch(() => null);
    const to = recipientDigits(body?.to);
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, 500) : "";
    if (!to || !text) return json({ error: "bad_request" }, { status: 400 });
    try {
      const result = await sendSolapi(to, text);
      if (result.error) return json({ error: result.error }, { status: result.status });
      return json({ sent: true });
    } catch {
      return json({ error: "unreachable" }, { status: 502 });
    }
  }

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 32_000) {
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
  const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
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
