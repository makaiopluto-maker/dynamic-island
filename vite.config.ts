import { existsSync, readFileSync, renameSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";
import { handleApi, toWebRequest, writeNodeResponse } from "./server/api.mjs";
import { serveInstaller } from "./server/download.mjs";

const islandVersion = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version as string;

function sourceEntry(): Plugin {
  return {
    name: "source-entry",
    config() {
      return { build: { rollupOptions: { input: "index.source.html" } } };
    },
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, query] = (req.url ?? "").split("?");
        if (path === "/" || path === "/index.html") {
          req.url = query ? `/index.source.html?${query}` : "/index.source.html";
        }
        next();
      });
    },
    closeBundle() {
      const from = "dist/index.source.html";
      if (existsSync(from)) renameSync(from, "dist/index.html");
    },
  };
}

function islandApi(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use(async (req, res, next) => {
      if (serveInstaller(req, res)) return;
      const url = req.url ?? "";
      if (!url.startsWith("/api/")) {
        next();
        return;
      }
      try {
        const response = await handleApi(await toWebRequest(req));
        if (!response) {
          next();
          return;
        }
        await writeNodeResponse(res, response);
      } catch {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "island_api_failed" }));
      }
    });
  };

  return {
    name: "island-api",
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

export default defineConfig({
  base: process.env.PAGES_BASE || "/",
  define: {
    __ISLAND_VERSION__: JSON.stringify(islandVersion),
  },
  plugins: [react(), sourceEntry(), islandApi()],
  server: {
    host: "127.0.0.1",
    port: 4731,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4731,
    strictPort: true,
  },
});
