import http from "node:http";
import { logger } from "./logger.js";

export function startHealthServer(): http.Server | null {
  const port = process.env.PORT;
  if (!port) {
    return null;
  }

  const server = http.createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  server.listen(Number(port), "0.0.0.0", () => {
    logger.info("Health server is listening", { port });
  });

  return server;
}
