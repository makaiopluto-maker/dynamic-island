import { createReadStream, statSync } from "node:fs";
import { installerName } from "../shared/release.mjs";
import { appRoot, installerFile } from "./release.mjs";

export function serveInstaller(req, res, root = appRoot()) {
  const path = String(req.url ?? "").split("?")[0];
  if (path !== `/download/${installerName}`) return false;
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("allow", "GET, HEAD");
    res.end();
    return true;
  }
  const file = installerFile(root);
  if (!file) {
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("The installer is not on this copy.");
    return true;
  }
  const size = statSync(file).size;
  res.statusCode = 200;
  res.setHeader("content-type", "application/octet-stream");
  res.setHeader("content-length", String(size));
  res.setHeader("content-disposition", `attachment; filename="${installerName}"`);
  res.setHeader("cache-control", "public, max-age=300");
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  const stream = createReadStream(file);
  stream.on("error", () => {
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  });
  stream.pipe(res);
  return true;
}
