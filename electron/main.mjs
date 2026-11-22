import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, screen, Tray } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { compareVersions, releaseFeed } from "../shared/release.mjs";

const devUrl = process.env.ELECTRON_START_URL;
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("enable-features", "WebGPU,Vulkan");
app.commandLine.appendSwitch("enable-unsafe-webgpu");
let child = null;
let tray = null;
let overlay = null;
let quitting = false;

function appRoot() {
  if (app.isPackaged) return join(process.resourcesPath, "app");
  return join(import.meta.dirname, "..");
}

function freePort(start) {
  return new Promise((resolve) => {
    const tester = createServer();
    tester.once("error", () => resolve(freePort(start + 1)));
    tester.once("listening", () => tester.close(() => resolve(start)));
    tester.listen(start, "127.0.0.1");
  });
}

async function waitForServer(port) {
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

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  try {
    const env = {};
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) env[key] = value;
    }
    return env;
  } catch {
    return {};
  }
}

function startServer(root, port) {
  let log = "";
  const userData = app.getPath("userData");
  const localEnv = {
    ...readEnvFile(join(root, ".env")),
    ...readEnvFile(join(userData, "island.env")),
  };
  child = spawn(process.execPath, ["--experimental-strip-types", join(root, "server", "index.mjs")], {
    cwd: root,
    env: {
      ...process.env,
      ...localEnv,
      ELECTRON_RUN_AS_NODE: "1",
      HOST: "127.0.0.1",
      ISLAND_DESKTOP: "1",
      ISLAND_GEMINI_FILE: join(userData, "gemini-key"),
      ISLAND_ROOT: root,
      NODE_ENV: "production",
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const keep = (chunk) => {
    log = `${log}${chunk}`.slice(-2000);
  };
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);
  child.on("exit", (code) => {
    child = null;
    if (!quitting && code && code !== 0) {
      dialog.showErrorBox("Dynamic Island", log.trim() || "The island server stopped.");
      app.quit();
    }
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
    });
    note.show();
    mkdirSync(stampDir, { recursive: true });
    writeFileSync(stamp, data.version);
  } catch {
    /* A missing feed stays quiet. */
  }
}

function place(window) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  const height = Math.min(780, Math.max(520, Math.round(area.height * 0.72)));
  window.setBounds({ x: area.x, y: area.y, width: area.width, height });
}

function showOverlay() {
  if (!overlay || overlay.isDestroyed()) return;
  place(overlay);
  overlay.show();
  overlay.setAlwaysOnTop(true, "screen-saver");
}

function createWindow(port) {
  const window = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    thickFrame: false,
    title: "Dynamic Island",
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  place(window);
  window.setAlwaysOnTop(true, "screen-saver");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.setIgnoreMouseEvents(true, { forward: true });
  const target = new URL(devUrl || `http://127.0.0.1:${port}/`);
  target.searchParams.set("overlay", "1");
  void window.loadURL(target.toString());
  window.once("ready-to-show", () => showOverlay());
  window.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    window.hide();
  });
  return window;
}

function createTray() {
  const image = nativeImage.createFromPath(join(import.meta.dirname, "tray.png"));
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip("Dynamic Island");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show", click: () => showOverlay() },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", () => showOverlay());
}

ipcMain.on("island:interactive", (event, interactive) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return;
  if (interactive) window.setIgnoreMouseEvents(false);
  else window.setIgnoreMouseEvents(true, { forward: true });
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => showOverlay());
  app.whenReady().then(async () => {
    try {
      if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
      const port = devUrl ? Number(process.env.PORT) || 4731 : await freePort(4731);
      if (!devUrl) {
        startServer(appRoot(), port);
        await waitForServer(port);
      }
      overlay = createWindow(port);
      createTray();
      screen.on("display-metrics-changed", () => {
        if (overlay && !overlay.isDestroyed()) place(overlay);
      });
      void watchUpdates(overlay);
    } catch (error) {
      dialog.showErrorBox("Dynamic Island", error instanceof Error ? error.message : "The island did not open.");
      quitting = true;
      app.quit();
    }
  });
}

app.on("before-quit", () => {
  quitting = true;
  child?.kill();
});

app.on("window-all-closed", () => {
  if (quitting) app.quit();
});
