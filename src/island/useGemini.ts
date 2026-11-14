import { useCallback, useEffect, useState } from "react";

export type GeminiTurn = { role: "user" | "model"; text: string };

export function useGemini() {
  const [turns, setTurns] = useState<GeminiTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        setError(body.error === "not_configured" ? "Gemini isn't connected on this copy yet." : "Gemini didn't answer.");
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
  return { turns, draft, setDraft, pending, configured, error, send, lastReply };
}
