import { useCallback, useEffect, useRef, useState } from "react";

export type AiTurn = { role: "user" | "model"; text: string };

type AiStatus = "loading" | "ready" | "error";

type Engine = {
  chat: {
    completions: {
      create: (input: {
        messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
        max_tokens?: number;
        temperature?: number;
      }) => Promise<{ choices?: Array<{ message?: { content?: string | null } }> }>;
    };
  };
};

const MODEL = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";
const SYSTEM =
  "You are the AI inside Dynamic Island, a small glass panel on Windows. Reply in the user's language. Keep most answers under 80 words unless they ask for more.";

let shared: Promise<Engine> | null = null;

function webGpuOk() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

async function loadEngine(onProgress: (text: string, progress: number) => void): Promise<Engine> {
  if (!webGpuOk()) {
    throw new Error("이 PC의 그래픽이 로컬 AI를 지원하지 않습니다.");
  }
  const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
  return CreateMLCEngine(MODEL, {
    initProgressCallback: (report) => {
      const text = typeof report?.text === "string" ? report.text : "AI 준비 중…";
      const progress = typeof report?.progress === "number" ? report.progress : 0;
      onProgress(text, progress);
    },
  }) as Promise<Engine>;
}

export function useLocalAi(enabled = false) {
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<AiStatus>("loading");
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("AI 준비 중…");
  const [error, setError] = useState<string | null>(null);
  const engine = useRef<Engine | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    if (!shared) {
      shared = loadEngine((text, value) => {
        if (!alive) return;
        setProgressText(text);
        setProgress(Math.max(0, Math.min(1, value)));
      }).catch((reason) => {
        shared = null;
        throw reason;
      });
    }
    shared
      .then((instance) => {
        if (!alive) return;
        engine.current = instance;
        setStatus("ready");
        setProgress(1);
        setProgressText("준비됨");
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!alive) return;
        setStatus("error");
        setError(reason instanceof Error ? reason.message : "AI를 준비하지 못했습니다.");
      });
    return () => {
      alive = false;
    };
  }, [enabled]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || pending || status !== "ready" || !engine.current) return;
    const history = [...turns, { role: "user" as const, text }];
    setTurns(history);
    setDraft("");
    setPending(true);
    setError(null);
    try {
      const reply = await engine.current.chat.completions.create({
        messages: [
          { role: "system", content: SYSTEM },
          ...history.map((turn) => ({
            role: (turn.role === "model" ? "assistant" : "user") as "assistant" | "user",
            content: turn.text,
          })),
        ],
        max_tokens: 220,
        temperature: 0.7,
      });
      const answer = reply.choices?.[0]?.message?.content?.trim();
      if (!answer) {
        setError("AI가 답하지 않았습니다.");
        return;
      }
      setTurns([...history, { role: "model", text: answer }]);
    } catch {
      setError("AI가 답하지 않았습니다.");
    } finally {
      setPending(false);
    }
  }, [draft, pending, status, turns]);

  const lastReply = [...turns].reverse().find((turn) => turn.role === "model")?.text ?? "";
  const configured: boolean | null = status === "loading" ? null : status === "ready";

  return {
    turns,
    draft,
    setDraft,
    pending,
    configured,
    status,
    progress,
    progressText,
    error,
    send,
    lastReply,
  };
}
