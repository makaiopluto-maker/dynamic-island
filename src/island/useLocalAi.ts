import { useCallback, useEffect, useState } from "react";

export type AiTurn = { role: "user" | "model"; text: string };

type AiStatus = "loading" | "ready" | "need_key" | "error";

const KEY_STORE = "island-gemini-key";
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const SYSTEM =
  "You are the AI inside Dynamic Island, a small glass panel on Windows. Reply in the user's language. Keep most answers under 80 words unless they ask for more.";

function readKey() {
  try {
    const key = localStorage.getItem(KEY_STORE)?.trim() ?? "";
    return /^AIza[0-9A-Za-z_-]{20,}$/.test(key) ? key : "";
  } catch {
    return "";
  }
}

function writeKey(key: string) {
  localStorage.setItem(KEY_STORE, key);
}

async function askDirect(messages: AiTurn[], key: string) {
  const contents = messages.map((message) => ({
    role: message.role === "model" ? "model" : "user",
    parts: [{ text: message.text }],
  }));
  for (const model of MODELS) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents,
          generationConfig: { maxOutputTokens: 400, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (response.status === 404) continue;
    if (!response.ok) {
      if (response.status === 400 || response.status === 403) return { error: "bad_key" as const };
      return { error: "unreachable" as const };
    }
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (!text) return { error: "unreachable" as const };
    return { text };
  }
  return { error: "unreachable" as const };
}

export function useLocalAi(enabled = false) {
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<AiStatus>("loading");
  const [localKey, setLocalKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const stored = readKey();
    if (stored) {
      setLocalKey(stored);
      setStatus("ready");
      return;
    }
    setStatus("loading");
    fetch("/api/gemini", { signal: AbortSignal.timeout(5000) })
      .then((response) => response.json())
      .then((body: { configured?: boolean }) => {
        if (!alive) return;
        setStatus(body.configured ? "ready" : "need_key");
      })
      .catch(() => {
        if (!alive) return;
        setStatus("need_key");
      });
    return () => {
      alive = false;
    };
  }, [attempt, enabled]);

  const saveKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (!trimmed || pending) return false;
    if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(trimmed)) {
      setError("Google AI 키 형식이 올바르지 않습니다.");
      return false;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmed)}`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) {
        setError("그 키로는 연결되지 않습니다.");
        return false;
      }
      writeKey(trimmed);
      setLocalKey(trimmed);
      setStatus("ready");
      try {
        await fetch("/api/gemini/key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: trimmed }),
        });
      } catch {
        /* Local key is enough. */
      }
      return true;
    } catch {
      setError("그 키로는 연결되지 않습니다.");
      return false;
    } finally {
      setPending(false);
    }
  }, [pending]);

  const retry = useCallback(() => {
    setError(null);
    setStatus("loading");
    setAttempt((value) => value + 1);
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || pending || status !== "ready") return;
    const history = [...turns, { role: "user" as const, text }];
    setTurns(history);
    setDraft("");
    setPending(true);
    setError(null);
    try {
      if (localKey) {
        const result = await askDirect(history, localKey);
        if (result.error === "bad_key") {
          setStatus("need_key");
          setError("Google AI 키를 다시 저장하세요.");
          return;
        }
        if (result.error || !result.text) {
          setError("AI가 답하지 않았습니다.");
          return;
        }
        setTurns([...history, { role: "model", text: result.text }]);
        return;
      }
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: AbortSignal.timeout(25000),
      });
      const body = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !body.text) {
        if (body.error === "not_configured") {
          setStatus("need_key");
          setError("Google AI 키를 저장하면 채팅할 수 있습니다.");
          return;
        }
        setError("AI가 답하지 않았습니다.");
        return;
      }
      setTurns([...history, { role: "model", text: body.text }]);
    } catch {
      setError("AI가 답하지 않았습니다.");
    } finally {
      setPending(false);
    }
  }, [draft, localKey, pending, status, turns]);

  const lastReply = [...turns].reverse().find((turn) => turn.role === "model")?.text ?? "";
  const configured: boolean | null = status === "loading" ? null : status === "ready";

  return {
    turns,
    draft,
    setDraft,
    pending,
    configured,
    status,
    progress: status === "ready" ? 1 : status === "loading" ? 0.4 : 0,
    progressText: status === "loading" ? "AI 준비 중…" : status === "ready" ? "준비됨" : "",
    error,
    send,
    saveKey,
    retry,
    lastReply,
  };
}
