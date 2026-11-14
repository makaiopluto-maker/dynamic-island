import { useCallback, useEffect, useRef, useState } from "react";

type BrightnessBody = { supported?: boolean; level?: number | null };

export function useBrightness() {
  const [level, setLevel] = useState<number | null>(null);
  const [supported, setSupported] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/brightness", { signal: controller.signal })
      .then((response) => response.json())
      .then((body: BrightnessBody) => {
        setSupported(Boolean(body.supported));
        if (typeof body.level === "number") setLevel(body.level);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
      });
    return () => {
      controller.abort();
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  const set = useCallback((next: number) => {
    const levelValue = Math.max(0, Math.min(100, Math.round(next)));
    setLevel(levelValue);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void fetch("/api/brightness", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level: levelValue }),
      })
        .then((response) => response.json())
        .then((body: BrightnessBody) => {
          setSupported(Boolean(body.supported));
          if (typeof body.level === "number") setLevel(body.level);
        })
        .catch(() => {});
    }, 180);
  }, []);

  return { level, supported, set };
}
