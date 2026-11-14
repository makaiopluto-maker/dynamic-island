import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { handleApi, toWebRequest, writeNodeResponse } from "./api.mjs";

const port = Number(process.env.PORT) || 4731;
const root = join(process.cwd(), "dist");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

function fileFor(pathname) {
  const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
  const full = resolve(root, relative);
  if (full !== root && !full.startsWith(root + sep)) return null;
  if (existsSync(full) && statSync(full).isFile()) return full;
  const index = join(full, "index.html");
  if (existsSync(index) && index.startsWith(root + sep)) return index;
  return join(root, "index.html");
}

const server = createServer(async (req, res) => {
  try {
    const request = toWebRequest(req);
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const response = await handleApi(request);
      if (response) {
        await writeNodeResponse(res, response);
        return;
      }
    }
    const file = fileFor(url.pathname);
    if (!file || !existsSync(file)) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
    createReadStream(file).pipe(res);
  } catch {
    res.statusCode = 500;
    res.end("Island server failed");
  }
});

server.listen(port, "0.0.0.0");
