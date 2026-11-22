import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const unpacked = join(root, "release", "win-unpacked");
const appDesktop = join(unpacked, "resources", "app", "desktop");
const extras = ["dxcompiler.dll", "vk_swiftshader.dll", "vk_swiftshader_icd.json"];

for (const name of extras) {
  rmSync(join(unpacked, name), { force: true });
}

mkdirSync(appDesktop, { recursive: true });
for (const name of ["google-oauth.seed.json", "gemini.seed", "island.env"]) {
  const from = join(root, "desktop", name);
  if (!existsSync(from)) continue;
  copyFileSync(from, join(appDesktop, name));
}
