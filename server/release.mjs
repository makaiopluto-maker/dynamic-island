import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { compareVersions, installerName, releaseFeed, safeDownloadUrl } from "../shared/release.mjs";

export function appRoot() {
  return process.env.ISLAND_ROOT || process.cwd();
}

export function installerFile(root = appRoot()) {
  for (const path of [join(root, "desktop", installerName), join(root, "release", installerName)]) {
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

function readNotes(root) {
  try {
    const extra = JSON.parse(readFileSync(join(root, "desktop", "release.json"), "utf8"));
    return typeof extra.notes === "string" ? extra.notes.trim().slice(0, 180) : "";
  } catch {
    return "";
  }
}

function localRelease(root) {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const version = typeof pkg.version === "string" && /^\d+\.\d+\.\d+$/.test(pkg.version) ? pkg.version : "0.0.0";
  const file = installerFile(root);
  return {
    version,
    notes: readNotes(root),
    download: Boolean(file),
    bytes: file ? statSync(file).size : null,
  };
}

let remote = { at: 0, value: null };

async function remoteRelease() {
  const now = Date.now();
  if (now - remote.at < 10 * 60 * 1000) return remote.value;
  remote.at = now;
  const feed = process.env.ISLAND_RELEASE_URL?.trim() || releaseFeed;
  try {
    const response = await fetch(feed, {
      headers: { accept: "application/json", "user-agent": "DynamicIsland" },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      remote.value = null;
      return null;
    }
    const data = await response.json();
    if (!data || typeof data.version !== "string" || !/^\d+\.\d+\.\d+$/.test(data.version)) {
      remote.value = null;
      return null;
    }
    remote.value = {
      version: data.version,
      notes: typeof data.notes === "string" ? data.notes.trim().slice(0, 180) : "",
      downloadUrl: safeDownloadUrl(data.download),
    };
    return remote.value;
  } catch {
    remote.value = null;
    return null;
  }
}

export async function releaseStatus(root = appRoot()) {
  const local = localRelease(root);
  const latestRemote = await remoteRelease();
  const newer = latestRemote && compareVersions(latestRemote.version, local.version) > 0 ? latestRemote : null;
  return {
    version: local.version,
    notes: newer?.notes || local.notes,
    download: local.download,
    bytes: local.bytes,
    latest: newer?.version ?? local.version,
    downloadUrl: newer?.downloadUrl ?? null,
    desktop: process.env.ISLAND_DESKTOP === "1",
  };
}
