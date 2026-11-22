import { useCallback, useEffect, useState } from "react";

export type AiTurn = { role: "user" | "model"; text: string };

const TOKEN_STORE = "island-openclaw-token";
const BASE_STORE = "island-openclaw-base";
const DEFAULT_BASE = "http://127.0.0.1:18789";
const MODEL = "openclaw/default";
const SESSION = "island:dynamic-island";

export type OpenClawStatus = "checking" | "ready" | "need_token" | "offline" | "disabled";

function readToken() {
  try {
    return localStorage.getItem(TOKEN_STORE)?.trim() ?? "";
  } catch {
    return "";
  }
}

function writeToken(token: string) {
  if (token) localStorage.setItem(TOKEN_STORE, token);
  else localStorage.removeItem(TOKEN_STORE);
}

function readBase() {
  try {
    return localStorage.getItem(BASE_STORE)?.trim() || DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

function authHeaders(token: string): HeadersInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function probeDirect(base: string, token: string): Promise<OpenClawStatus> {
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/v1/models`, {
      headers: authHeaders(token),
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 401 || response.status === 403) return "need_token";
    if (response.status === 404) return "disabled";
    if (!response.ok) return "offline";
    return "ready";
  } catch {
    return "offline";
  }
}

async function askDirect(base: string, token: string, messages: AiTurn[]) {
  const response = await fetch(`${base.replace(/\/$/, "")}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      model: MODEL,
      user: SESSION,
      messages: [
        {
          role: "system",
          content:
            "You are the AI inside Dynamic Island, a small glass panel on Windows. Reply in the user's language. Keep most answers under 80 words unless they ask for more.",
        },
        ...messages.map((message) => ({
          role: message.role === "model" ? "assistant" : "user",
          content: message.text,
        })),
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (response.status === 401 || response.status === 403) return { error: "need_token" as const };
  if (response.status === 404) return { error: "disabled" as const };
  if (!response.ok) return { error: "unreachable" as const };
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
  };
  const raw = data.choices?.[0]?.message?.content;
  const text =
    typeof raw === "string"
      ? raw.trim()
      : Array.isArray(raw)
        ? raw
            .map((part) => (typeof part.text === "string" ? part.text : ""))
            .filter(Boolean)
            .join("\n")
            .trim()
        : "";
  if (!text) return { error: "unreachable" as const };
  return { text };
}

export function useOpenClaw() {
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<OpenClawStatus>("checking");
  const [token, setToken] = useState("");
  const [base, setBase] = useState(DEFAULT_BASE);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (nextToken = readToken(), nextBase = readBase()) => {
    setToken(nextToken);
    setBase(nextBase);
    const viaServer = await fetch("/api/openclaw", {
      headers: nextToken ? { authorization: `Bearer ${nextToken}` } : undefined,
      signal: AbortSignal.timeout(5000),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { status?: OpenClawStatus };
        if (typeof body.status === "string") return body.status;
        return null;
      })
      .catch(() => null);
    if (viaServer) {
      setStatus(viaServer);
      return viaServer;
    }
    const direct = await probeDirect(nextBase, nextToken);
    setStatus(direct);
    return direct;
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const saveToken = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      setPending(true);
      setError(null);
      try {
        writeToken(trimmed);
        const next = await refresh(trimmed, base);
        if (next === "ready") return true;
        if (next === "need_token") {
          setError("Gateway 토큰이 맞지 않습니다.");
          return false;
        }
        if (next === "disabled") {
          setError("OpenClaw에서 chatCompletions를 켜야 합니다.");
          return false;
        }
        setError("OpenClaw Gateway에 연결되지 않았습니다.");
        return false;
      } finally {
        setPending(false);
      }
    },
    [base, refresh],
  );

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || pending || status !== "ready") return;
    const history = [...turns, { role: "user" as const, text }];
    setTurns(history);
    setDraft("");
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/openclaw", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ messages: history, base }),
        signal: AbortSignal.timeout(65000),
      });
      if (response.ok) {
        const body = (await response.json()) as { text?: string; error?: string };
        if (body.text) {
          setTurns([...history, { role: "model", text: body.text }]);
          return;
        }
      } else if (response.status !== 404 && response.status !== 502) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (body.error === "need_token") {
          setStatus("need_token");
          setError("Gateway 토큰을 저장하세요.");
          return;
        }
        if (body.error === "disabled") {
          setStatus("disabled");
          setError("OpenClaw chatCompletions가 꺼져 있습니다.");
          return;
        }
      }

      const result = await askDirect(base, token, history);
      if (result.error === "need_token") {
        setStatus("need_token");
        setError("Gateway 토큰을 저장하세요.");
        return;
      }
      if (result.error === "disabled") {
        setStatus("disabled");
        setError("OpenClaw chatCompletions가 꺼져 있습니다.");
        return;
      }
      if (result.error || !result.text) {
        setStatus("offline");
        setError("OpenClaw가 답하지 않았습니다. Gateway가 켜져 있는지 확인하세요.");
        return;
      }
      setTurns([...history, { role: "model", text: result.text }]);
      setStatus("ready");
    } catch {
      setError("OpenClaw가 답하지 않았습니다.");
    } finally {
      setPending(false);
    }
  }, [base, draft, pending, status, token, turns]);

  const lastReply = [...turns].reverse().find((turn) => turn.role === "model")?.text ?? "";
  const configured: boolean | null = status === "checking" ? null : status === "ready";

  return {
    turns,
    draft,
    setDraft,
    pending,
    configured,
    status,
    token,
    error,
    send,
    saveToken,
    refresh,
    lastReply,
  };
}
