import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { isApprovedBackendRequest } from "./src/backend/routes.ts";
import type { IncomingMessage, ServerResponse } from "node:http";

const proxy = { "/api/": { target: "http://127.0.0.1:8000", ws: false } };
// This protects the frontend proxy surface. It is not backend authorization.
function readOnlyApi(): Plugin {
  const middleware = (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    if (!request.url?.startsWith("/api")) return next();
    if (isApprovedBackendRequest(request.method ?? "", request.url))
      return next();
    response.statusCode = request.method === "GET" ? 404 : 405;
    response.setHeader("Content-Type", "application/problem+json");
    response.end(
      JSON.stringify({
        title: "Unavailable in this local connection",
        status: response.statusCode,
        detail:
          "Only the approved inventory, reports and metadata GET routes are enabled.",
      }),
    );
  };
  return {
    name: "swale-approved-read-only-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [readOnlyApi(), react()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true, proxy },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true, proxy },
  build: { chunkSizeWarningLimit: 1800 },
});
