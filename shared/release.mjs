export const installerName = "Dynamic-Island-Setup.exe";

export const releaseFeed = "https://raw.githubusercontent.com/makaiopluto-maker/dynamic-island/main/desktop/release.json";

const downloadHosts = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
]);

export function compareVersions(left, right) {
  const parts = (value) =>
    String(value)
      .split(".")
      .map((part) => {
        const number = Number.parseInt(part, 10);
        return Number.isFinite(number) ? number : 0;
      });
  const a = parts(left);
  const b = parts(right);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function safeDownloadUrl(value) {
  if (typeof value !== "string" || !value.startsWith("https://")) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (!downloadHosts.has(url.hostname.toLowerCase())) return null;
    if (!url.pathname.toLowerCase().endsWith(".exe")) return null;
    return url.toString();
  } catch {
    return null;
  }
}
