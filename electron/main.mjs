import { app, BrowserWindow, dialog, Notification } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { compareVersions, releaseFeed } from "../shared/release.mjs";

const port = process.env.PORT || "4731";
const devUrl = process.env.ELECTRON_START_URL;
let child = null;

function appRoot() {
  if (app.isPackaged) return join(process.resourcesPath, "app");
  return join(import.meta.dirname, "..");
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.status < 500) return;
    } catch {
      /* The server is still starting. */
    }
    await delay(200);
  }
  throw new Error("The island server did not start.");
}

function startServer(root) {
  child = spawn(process.execPath, ["--experimental-strip-types", join(root, "server", "index.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOST: "127.0.0.1",
      ISLAND_DESKTOP: "1",
      ISLAND_ROOT: root,
      NODE_ENV: "production",
      PORT: port,
    },
    stdio: "ignore",
  });
  child.on("exit", (code) => {
    child = null;
    if (code && code !== 0) app.quit();
  });
}

function installedVersion() {
  try {
    return JSON.parse(readFileSync(join(appRoot(), "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
}

async function watchUpdates(window) {
  const local = installedVersion();
  try {
    const response = await fetch(process.env.ISLAND_RELEASE_URL?.trim() || releaseFeed, {
      headers: { accept: "application/json", "user-agent": "DynamicIsland" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return;
    const data = await response.json();
    if (typeof data?.version !== "string" || !/^\d+\.\d+\.\d+$/.test(data.version)) return;
    if (compareVersions(data.version, local) <= 0) return;
    const stampDir = app.getPath("userData");
    const stamp = join(stampDir, "update-notified");
    if (existsSync(stamp) && readFileSync(stamp, "utf8").trim() === data.version) return;
    if (!Notification.isSupported()) return;
    const note = new Notification({
      title: "Dynamic Island",
      body: `Version ${data.version} is ready.`,
    });
    note.on("click", () => {
      if (window.isDestroyed()) return;
      window.show();
      window.focus();
    });
    note.show();
    mkdirSync(stampDir, { recursive: true });
    writeFileSync(stamp, data.version);
  } catch {
    /* A missing feed stays quiet. */
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#1a120c",
    autoHideMenuBar: true,
    title: "Dynamic Island",
    webPreferences: { contextIsolation: true },
  });
  void window.loadURL(devUrl || `http://127.0.0.1:${port}/`);
  return window;
}

app.whenReady().then(async () => {
  try {
    if (!devUrl) {
      startServer(appRoot());
      await waitForServer();
    }
    const window = createWindow();
    void watchUpdates(window);
  } catch (error) {
    dialog.showErrorBox("Dynamic Island", error instanceof Error ? error.message : "The island did not open.");
    app.quit();
  }
});

app.on("before-quit", () => {
  child?.kill();
});

app.on("window-all-closed", () => app.quit());
