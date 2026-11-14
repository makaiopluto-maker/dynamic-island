import { app, BrowserWindow } from "electron";

const port = process.env.PORT || "4731";
const devUrl = process.env.ELECTRON_START_URL;

if (!devUrl) {
  process.env.PORT = port;
  await import("../server/index.mjs");
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    backgroundColor: "#1a120c",
    autoHideMenuBar: true,
    title: "Dynamic Island",
    webPreferences: { contextIsolation: true },
  });
  void window.loadURL(devUrl || `http://127.0.0.1:${port}/`);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
