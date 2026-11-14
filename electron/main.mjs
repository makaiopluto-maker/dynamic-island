import { app, BrowserWindow, dialog } from "electron";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

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
}

app.whenReady().then(async () => {
  try {
    if (!devUrl) {
      startServer(appRoot());
      await waitForServer();
    }
    createWindow();
  } catch (error) {
    dialog.showErrorBox("Dynamic Island", error instanceof Error ? error.message : "The island did not open.");
    app.quit();
  }
});

app.on("before-quit", () => {
  child?.kill();
});

app.on("window-all-closed", () => app.quit());
