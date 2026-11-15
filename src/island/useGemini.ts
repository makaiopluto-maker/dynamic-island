import { useCallback, useEffect, useState } from "react";

export type GeminiTurn = { role: "user" | "model"; text: string };

export function useGemini() {
  const [turns, setTurns] = useState<GeminiTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/gemini", { signal: controller.signal })
      .then((response) => response.json())
      .then((body: { configured?: boolean; desktop?: boolean }) => {
        setConfigured(Boolean(body.configured));
        setDesktop(body.desktop === true);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setConfigured(false);
        setDesktop(false);
      });
    return () => controller.abort();
  }, []);

  const saveKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (!trimmed || pending) return false;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/gemini/key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: trimmed }),
      });
      const body = (await response.json()) as { configured?: boolean; error?: string };
      if (!response.ok || !body.configured) {
        setError("그 키로는 연결되지 않습니다.");
        return false;
      }
      setConfigured(true);
      setDesktop(true);
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
            : body.error === "unauthorized"
              ? "Sign in to use Gemini."
              : "Gemini didn't answer.",
        );
        return;
      }
      setTurns([...history, { role: "model", text: body.text }]);
    } catch {
      setError("Gemini didn't answer.");
    } finally {
      setPending(false);
    }
  }, [configured, draft, pending, turns]);

  const lastReply = [...turns].reverse().find((turn) => turn.role === "model")?.text ?? "";
  return { turns, draft, setDraft, pending, configured, desktop, error, send, saveKey, lastReply };
}
