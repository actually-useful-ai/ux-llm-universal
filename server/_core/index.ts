import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerOllamaProxy } from "../ollama-proxy";
import { registerDreamerProxy } from "../dreamer-proxy";
import { registerManusProxy } from "../manus-proxy";
import { registerBeltalowdaProxy } from "../beltalowda-proxy";
import { registerSafeguardProxy } from "../safeguard-proxy";
import { registerPublicArtifactProxy } from "../public-artifact-proxy";
import { registerXaiUtilityProxy } from "../xai-utility-proxy";
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
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Ollama API proxy (bypasses CORS for cloud/remote connections)
  registerOllamaProxy(app);
  // Multi-provider proxy via Dreamer API (keys from env only)
  registerDreamerProxy(app);
  // Manus task-based async agent proxy
  registerManusProxy(app);
  // Beltalowda multi-agent research proxy (SSE bridge)
  registerBeltalowdaProxy(app);
  // Content safety evaluation proxy
  registerSafeguardProxy(app);
  // Public share/showcase endpoints over existing artifact records
  registerPublicArtifactProxy(app);
  // xAI utility endpoints for realtime voice + tokenization
  registerXaiUtilityProxy(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
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
