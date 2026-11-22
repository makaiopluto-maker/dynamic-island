import { useCallback, useEffect, useState } from "react";

export type GeminiTurn = { role: "user" | "model"; text: string };

const KEY_STORE = "island-gemini-key";
const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

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

async function askDirect(messages: GeminiTurn[], key: string) {
  const contents = messages.map((message) => ({
    role: message.role === "model" ? "model" : "user",
    parts: [{ text: message.text }],
  }));
  let lastStatus = 502;
  for (const model of MODELS) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "You are Gemini inside Dynamic Island. Reply in the user's language. Keep most answers under 80 words unless the user asks for more.",
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
  return { error: lastStatus === 404 ? ("unreachable" as const) : ("unreachable" as const) };
}

export function useGemini() {
  const [turns, setTurns] = useState<GeminiTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [localKey, setLocalKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = readKey();
    if (stored) {
      setLocalKey(stored);
      setConfigured(true);
      return;
    }
    const controller = new AbortController();
    fetch("/api/gemini", { signal: controller.signal })
      .then((response) => response.json())
      .then((body: { configured?: boolean }) => setConfigured(Boolean(body.configured)))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setConfigured(false);
      });
    return () => controller.abort();
  }, []);

  const saveKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (!trimmed || pending) return false;
    if (!/^AIza[0-9A-Za-z_-]{20,}$/.test(trimmed)) {
      setError("Gemini API 키 형식이 올바르지 않습니다.");
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
      setConfigured(true);
      try {
        await fetch("/api/gemini/key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: trimmed }),
        });
      } catch {
        /* Local key is enough when the desktop file store is offline. */
      }
      return true;
    } catch {
      setError("그 키로는 연결되지 않습니다.");
      return false;
    } finally {
      setPending(false);
    }
  }, [pending]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || pending) return;
    const history = [...turns, { role: "user" as const, text }];
    setTurns(history);
    setDraft("");
    setPending(true);
    setError(null);
    try {
      if (localKey) {
        const result = await askDirect(history, localKey);
        if (result.error === "bad_key") {
          setConfigured(false);
          setError("Gemini API 키를 다시 저장하세요.");
          return;
        }
        if (result.error || !result.text) {
          setError("Gemini가 답하지 않았습니다.");
          return;
        }
        setTurns([...history, { role: "model", text: result.text }]);
        return;
      }
      const response = await fetch("/api/gemini", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const body = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !body.text) {
        setConfigured(body.error === "not_configured" ? false : configured);
        setError(
          body.error === "not_configured"
            ? "Gemini API 키를 저장하면 채팅할 수 있습니다."
            : "Gemini가 답하지 않았습니다.",
        );
        return;
      }
      setTurns([...history, { role: "model", text: body.text }]);
    } catch {
      setError("Gemini가 답하지 않았습니다.");
    } finally {
      setPending(false);
    }
  }, [configured, draft, localKey, pending, turns]);

  const lastReply = [...turns].reverse().find((turn) => turn.role === "model")?.text ?? "";
  return {
    turns,
    draft,
    setDraft,
    pending,
    configured,
    desktop: true,
    error,
    send,
    saveKey,
    lastReply,
  };
}
