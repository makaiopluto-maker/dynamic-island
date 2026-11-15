import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

function scriptPath() {
  const path = fileURLToPath(new URL("./brightness.ps1", import.meta.url));
  return path.includes("app.asar") ? path.replace("app.asar", "app.asar.unpacked") : path;
}

export function brightnessSupported() {
  return process.platform === "win32";
}

function run(args) {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath(), ...args],
      { timeout: 12000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve(null);
          return;
        }
        const level = Number(String(stdout).trim());
        resolve(Number.isInteger(level) && level >= 0 && level <= 100 ? level : null);
      },
    );
  });
}

export function readBrightness() {
  if (!brightnessSupported()) return Promise.resolve(null);
  return run(["-Action", "get"]);
}

export function writeBrightness(level) {
  if (!brightnessSupported()) return Promise.resolve(null);
  const safe = Math.max(0, Math.min(100, Math.round(Number(level))));
  if (!Number.isInteger(safe)) return Promise.resolve(null);
  return run(["-Action", "set", "-Level", String(safe)]);
}
