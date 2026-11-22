import { useEffect, useState } from "react";
import { compareVersions } from "../../shared/release.mjs";

declare const __ISLAND_VERSION__: string;

const seenKey = "island-seen-version";
const dismissKey = "island-update-dismissed";
const installerUrl = "https://github.com/makaiopluto-maker/dynamic-island/releases/latest/download/Dynamic-Island-Setup.exe";
const installerBytes = 96_236_019;

type Release = {
  version: string;
  notes: string;
  download: boolean;
  bytes: number | null;
  latest: string;
  downloadUrl: string | null;
  desktop: boolean;
};

function versionOf(value: unknown) {
  return typeof value === "string" && /^\d+\.\d+\.\d+$/.test(value) ? value : "";
}

function normalize(body: unknown): Release | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const version = versionOf(record.version);
  const latest = versionOf(record.latest) || version;
  if (!version) return null;
  return {
    version,
    notes: typeof record.notes === "string" ? record.notes.slice(0, 180) : "",
    download: record.download === true,
    bytes: typeof record.bytes === "number" && record.bytes > 0 ? record.bytes : null,
    latest,
    downloadUrl: typeof record.downloadUrl === "string" && record.downloadUrl.startsWith("https://") ? record.downloadUrl : null,
    desktop: record.desktop === true,
  };
}

function megabytes(bytes: number) {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

export function ReleaseNotice() {
  const built = __ISLAND_VERSION__;
  const [release, setRelease] = useState<Release | null>(null);
  const [seen, setSeen] = useState(() => localStorage.getItem(seenKey) ?? "");
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(dismissKey) ?? "");
  const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("update") === "1";

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const response = await fetch("/api/release");
        if (response.ok) {
          const next = normalize(await response.json());
          if (!stop && next) {
            setRelease(next);
            return;
          }
        }
      } catch {
        /* The public site has no local API. */
      }
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}release.json`);
        if (!response.ok) return;
        const next = normalize(await response.json());
        if (!stop && next) setRelease(next);
      } catch {
        /* The download button still points at the public installer. */
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 120_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  useEffect(() => {
    if (!seen && built) localStorage.setItem(seenKey, built);
  }, [seen, built]);

  const overlay = new URLSearchParams(window.location.search).get("overlay") === "1";
  if (!release && !preview && overlay) return null;

  const latest = preview ? "0.2.0" : (release?.latest ?? built);
  const ready = preview || compareVersions(latest, built) > 0;
  const updated = !ready && Boolean(seen) && compareVersions(built, seen) > 0;
  const showNotice = (ready && dismissed !== latest) || updated;
  const downloadHref = release?.desktop || overlay
    ? (ready ? release?.downloadUrl ?? null : null)
    : release?.download
      ? "/download/Dynamic-Island-Setup.exe"
      : (release?.downloadUrl ?? installerUrl);
  const bytes = release?.bytes ?? installerBytes;
  const canReload = ready && !release?.desktop;
  if (!showNotice && !downloadHref) return null;

  const dismiss = () => {
    if (ready) {
      sessionStorage.setItem(dismissKey, latest);
      setDismissed(latest);
      return;
    }
    localStorage.setItem(seenKey, built);
    setSeen(built);
  };

  return (
    <div className={showNotice ? "release" : "release quiet"} onClick={(event) => event.stopPropagation()}>
      {showNotice ? (
        <p role="status">
          {ready ? `Version ${latest} is ready.` : `Updated to ${built}.`}
          {release?.notes ? ` ${release.notes}` : ""}
        </p>
      ) : null}
      {canReload ? (
        <button type="button" className="release-action" onClick={() => window.location.reload()}>
          Reload
        </button>
      ) : null}
      {downloadHref ? (
        <a className="release-action" href={downloadHref}>
          {!release?.desktop ? `Windows · ${megabytes(bytes)}` : "Download"}
        </a>
      ) : null}
      {showNotice ? (
        <button type="button" className="release-dismiss" onClick={dismiss} aria-label="Dismiss the update notice">
          ×
        </button>
      ) : null}
    </div>
  );
}
