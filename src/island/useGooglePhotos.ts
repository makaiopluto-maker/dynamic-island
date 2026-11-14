import { useCallback, useEffect, useState } from "react";

const SESSION_KEY = "island-photo-session";

export type GooglePhoto = { id: string; sessionId: string };

type SessionBody = {
  id?: string;
  pickerUri?: string;
  mediaItemsSet?: boolean;
  pollMs?: number;
  items?: Array<{ id?: string }>;
  error?: string;
};

export function useGooglePhotos(active: boolean) {
  const [sessionId, setSessionId] = useState<string | null>(() => sessionStorage.getItem(SESSION_KEY));
  const [photos, setPhotos] = useState<GooglePhoto[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<"reconnect" | "unreachable" | null>(null);

  const refresh = useCallback(async (id: string) => {
    const response = await fetch(`/api/photos/session?id=${encodeURIComponent(id)}`);
    const body = (await response.json()) as SessionBody;
    if (body.error === "reconnect") {
      setError("reconnect");
      setPicking(false);
      return body;
    }
    if (body.error) {
      setError("unreachable");
      setPicking(false);
      return body;
    }
    if (body.mediaItemsSet) {
      setPhotos(
        (body.items ?? [])
          .map((item) => (item.id ? { id: item.id, sessionId: id } : null))
          .filter((item): item is GooglePhoto => item != null),
      );
      setPicking(false);
    } else {
      setPicking(true);
    }
    return body;
  }, []);

  useEffect(() => {
    if (!active || !sessionId) return;
    let stop = false;
    let timer = 0;
    const tick = async () => {
      try {
        const body = await refresh(sessionId);
        if (stop || body.mediaItemsSet || body.error || body.pollMs === 0) return;
        timer = window.setTimeout(() => void tick(), body.pollMs ?? 3000);
      } catch (reason: unknown) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        if (!stop) setError("unreachable");
      }
    };
    void tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [active, refresh, sessionId]);

  const choose = useCallback(async (popup: Window | null) => {
    setError(null);
    try {
      const response = await fetch("/api/photos/session", { method: "POST" });
      const body = (await response.json()) as SessionBody;
      if (!response.ok || !body.id || !body.pickerUri) {
        popup?.close();
        setError(body.error === "reconnect" ? "reconnect" : "unreachable");
        return;
      }
      sessionStorage.setItem(SESSION_KEY, body.id);
      setSessionId(body.id);
      setPicking(true);
      if (popup) popup.location.href = body.pickerUri;
      else window.location.assign(body.pickerUri);
    } catch {
      popup?.close();
      setError("unreachable");
    }
  }, []);

  return { photos, picking, error, choose };
}
