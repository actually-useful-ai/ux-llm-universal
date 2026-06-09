import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerOllamaProxy } from "../ollama-proxy";
import { registerDreamerProxy } from "../dreamer-proxy";
import { registerManusProxy } from "../manus-proxy";
import { registerSafeguardProxy } from "../safeguard-proxy";
import { registerPublicArtifactProxy } from "../public-artifact-proxy";
import { registerXaiUtilityProxy } from "../xai-utility-proxy";
import { registerDownloadProxy } from "../download-proxy";
import { registerXaiChatStream } from "../xai-chat-stream";
import {
  generationThrottle,
  perIpRateLimit,
  concurrencyLimit,
  isTrpcGenerationPath,
} from "../rate-limit";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Abuse throttling for public generation endpoints (per-IP rate limit +
  // global concurrency cap). Mounted before the proxies so it guards them.
  app.use(generationThrottle);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Ollama API proxy (bypasses CORS for cloud/remote connections)
  registerOllamaProxy(app);
  // Multi-provider proxy via Dreamer API (keys from env only)
  registerDreamerProxy(app);
  // Manus task-based async agent proxy
  registerManusProxy(app);
  // Content safety evaluation proxy
  registerSafeguardProxy(app);
  // Public share/showcase endpoints over existing artifact records
  registerPublicArtifactProxy(app);
  // xAI utility endpoints for realtime voice + tokenization
  registerXaiUtilityProxy(app);

  // ── Media-side abuse throttling (Stage 2 of the universal merge) ────
  // generationThrottle (above) keeps guarding the glm Express proxy
  // paths. The env-tunable media limiters guard the SSE chat stream,
  // the SSRF-guarded download proxy, and the expensive tRPC generation
  // procedures (image/video/tts). Queries and cheap procedures pass.
  app.use("/api/xai/chat/stream", perIpRateLimit, concurrencyLimit);
  app.use("/api/download", perIpRateLimit, concurrencyLimit);
  app.use("/api/trpc", (req, res, next) => {
    if (!isTrpcGenerationPath(req.path)) {
      next();
      return;
    }
    // Chain per-IP then concurrency. Each limiter either calls its next()
    // (allowed) or responds directly (429 / 503) without calling it.
    perIpRateLimit(req, res, () => {
      if (res.headersSent) return; // limiter already responded
      concurrencyLimit(req, res, next);
    });
  });

  // Streaming chat endpoint (raw SSE; tRPC doesn't stream well)
  registerXaiChatStream(app);
  // Download proxy for CORS-restricted media (SSRF-guarded)
  registerDownloadProxy(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Serve uploaded media files (media's legacy /uploads URLs + any
  // future local-disk writes land here)
  app.use("/uploads", express.static(
    process.env.NODE_ENV === "development"
      ? new URL("../../uploads", import.meta.url).pathname
      : new URL("../uploads", import.meta.url).pathname
  ));
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
