import { rmSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "release", "win-unpacked");
const extras = ["dxcompiler.dll", "vk_swiftshader.dll", "vk_swiftshader_icd.json"];

for (const name of extras) {
  rmSync(join(root, name), { force: true });
}
