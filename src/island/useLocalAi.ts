import { useCallback, useEffect, useRef, useState } from "react";

export type AiTurn = { role: "user" | "model"; text: string };

type AiStatus = "loading" | "ready" | "error";

type Generator = (
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options: {
    max_new_tokens?: number;
    do_sample?: boolean;
    temperature?: number;
    top_p?: number;
  },
) => Promise<Array<{ generated_text: Array<{ role: string; content: string }> | string }>>;

const MODEL = "onnx-community/Qwen2.5-0.5B-Instruct";
const SYSTEM =
  "You are the AI inside Dynamic Island, a small glass panel on Windows. Reply in the user's language. Keep most answers under 80 words unless they ask for more.";

let shared: Promise<Generator> | null = null;

type ProgressEvent = {
  status?: string;
  progress?: number;
  file?: string;
  loaded?: number;
  total?: number;
};

function friendlyProgress(event: ProgressEvent) {
  if (event.status === "initiate") return { text: "AI 준비 중…", progress: 0.02 };
  if (event.status === "download") return { text: "AI 모델 받는 중…", progress: 0.05 };
  if (event.status === "progress") {
    const ratio =
      typeof event.progress === "number"
        ? event.progress / 100
        : event.total
          ? (event.loaded ?? 0) / event.total
          : 0;
    return {
      text: "AI 모델 받는 중…",
      progress: Math.max(0.05, Math.min(0.95, ratio)),
    };
  }
  if (event.status === "done") return { text: "모델 파일 준비됨…", progress: 0.96 };
  if (event.status === "ready") return { text: "거의 다 됐어요…", progress: 0.98 };
  return null;
}

async function loadGenerator(onProgress: (text: string, progress: number) => void): Promise<Generator> {
  onProgress("AI 준비 중…", 0.02);
  const { pipeline, env } = await import("@huggingface/transformers");
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  const generator = await pipeline("text-generation", MODEL, {
    device: "wasm",
    dtype: "q4",
    progress_callback: (event: ProgressEvent) => {
      const next = friendlyProgress(event);
      if (next) onProgress(next.text, next.progress);
    },
  });
  onProgress("준비됨", 1);
  return generator as unknown as Generator;
}

function answerFrom(output: Awaited<ReturnType<Generator>>) {
  const generated = output?.[0]?.generated_text;
  if (typeof generated === "string") return generated.trim();
  if (!Array.isArray(generated)) return "";
  const last = [...generated].reverse().find((item) => item.role === "assistant");
  return typeof last?.content === "string" ? last.content.trim() : "";
}

export function useLocalAi(enabled = false) {
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<AiStatus>("loading");
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("AI 준비 중…");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const generator = useRef<Generator | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    if (!shared) {
      shared = loadGenerator((text, value) => {
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
        generator.current = instance;
        setStatus("ready");
        setProgress(1);
        setProgressText("준비됨");
        setError(null);
      })
      .catch(() => {
        if (!alive) return;
        setStatus("error");
        setError("AI를 준비하지 못했습니다. 인터넷 연결 후 다시 시도하세요.");
      });
    return () => {
      alive = false;
    };
  }, [attempt, enabled]);

  const retry = useCallback(() => {
    shared = null;
    generator.current = null;
    setStatus("loading");
    setProgress(0);
    setProgressText("AI 준비 중…");
    setError(null);
    setAttempt((value) => value + 1);
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || pending || status !== "ready" || !generator.current) return;
    const history = [...turns, { role: "user" as const, text }];
    setTurns(history);
    setDraft("");
    setPending(true);
    setError(null);
    try {
      const output = await generator.current(
        [
          { role: "system", content: SYSTEM },
          ...history.map((turn) => ({
            role: (turn.role === "model" ? "assistant" : "user") as "assistant" | "user",
            content: turn.text,
          })),
        ],
        {
          max_new_tokens: 180,
          do_sample: true,
          temperature: 0.7,
          top_p: 0.9,
        },
      );
      const answer = answerFrom(output);
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
    retry,
    lastReply,
  };
}
