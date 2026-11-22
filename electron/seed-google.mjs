#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const id = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
const secret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
const gemini = (process.env.GEMINI_API_KEY ?? "").trim();

if (!id || !secret) {
  console.log("seed-google: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing — skip seed");
  process.exit(0);
}

const seedPath = join(root, "desktop", "google-oauth.seed.json");
mkdirSync(dirname(seedPath), { recursive: true });
writeFileSync(seedPath, `${JSON.stringify({ id, secret }, null, 2)}\n`, { mode: 0o600 });
console.log(`seed-google: wrote ${seedPath}`);

if (/^AIza[0-9A-Za-z_-]{20,}$/.test(gemini)) {
  const geminiPath = join(root, "desktop", "gemini.seed");
  writeFileSync(geminiPath, `${gemini}\n`, { mode: 0o600 });
  console.log(`seed-google: wrote ${geminiPath}`);
}
