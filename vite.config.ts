import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";
import { handleApi, toWebRequest, writeNodeResponse } from "./server/api.mjs";

function islandApi(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use(async (req, res, next) => {
      const url = req.url ?? "";
      if (!url.startsWith("/api/")) {
        next();
        return;
      }
      try {
        const response = await handleApi(toWebRequest(req));
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
  plugins: [react(), islandApi()],
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
