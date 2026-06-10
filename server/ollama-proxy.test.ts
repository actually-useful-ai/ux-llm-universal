import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import { registerOllamaProxy } from "./ollama-proxy";
import http from "http";

// We can't mock global fetch because the test itself uses fetch to call the proxy.
// Instead, we test the proxy by intercepting the upstream call at a real mock server.

function createMockOllama(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, () => {
      const port = (server.address() as any).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}

function startProxy(): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    registerOllamaProxy(app);
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => server.close(),
      });
    });
  });
}

describe("ollama-proxy", () => {
  let proxy: { url: string; close: () => void };
  let savedOllamaHost: string | undefined;

  beforeEach(async () => {
    // The SSRF guard blocks loopback targets unless they are the
    // operator-configured host (OLLAMA_HOST/OLLAMA_URL). The mock upstream
    // lives on 127.0.0.1, so opt it in the same way a real local Ollama
    // deployment would be.
    savedOllamaHost = process.env.OLLAMA_HOST;
    process.env.OLLAMA_HOST = "127.0.0.1";
    proxy = await startProxy();
  });

  afterEach(() => {
    if (savedOllamaHost === undefined) delete process.env.OLLAMA_HOST;
    else process.env.OLLAMA_HOST = savedOllamaHost;
    proxy.close();
  });

  describe("GET /api/ollama/tags", () => {
    it("proxies to the target server and returns models", async () => {
      const mockOllama = await createMockOllama((req, res) => {
        expect(req.url).toBe("/api/tags");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          models: [{ name: "glm4:9b", model: "glm4:9b", size: 5000000000 }],
        }));
      });

      try {
        const response = await fetch(`${proxy.url}/api/ollama/tags`, {
          headers: {
            "x-ollama-url": mockOllama.url,
            "Content-Type": "application/json",
          },
        });

        expect(response.ok).toBe(true);
        const data = await response.json();
        expect(data.models).toHaveLength(1);
        expect(data.models[0].name).toBe("glm4:9b");
      } finally {
        mockOllama.close();
      }
    });

    it("forwards Authorization header when API key is provided", async () => {
      let receivedAuth = "";
      const mockOllama = await createMockOllama((req, res) => {
        receivedAuth = req.headers.authorization || "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ models: [] }));
      });

      try {
        await fetch(`${proxy.url}/api/ollama/tags`, {
          headers: {
            "x-ollama-url": mockOllama.url,
            "x-ollama-key": "my-secret-key",
            "Content-Type": "application/json",
          },
        });

        expect(receivedAuth).toBe("Bearer my-secret-key");
      } finally {
        mockOllama.close();
      }
    });

    it("returns error when upstream returns non-ok", async () => {
      const mockOllama = await createMockOllama((req, res) => {
        res.writeHead(401, { "Content-Type": "text/plain" });
        res.end("Unauthorized");
      });

      try {
        const response = await fetch(`${proxy.url}/api/ollama/tags`, {
          headers: {
            "x-ollama-url": mockOllama.url,
            "Content-Type": "application/json",
          },
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toContain("401");
      } finally {
        mockOllama.close();
      }
    });
  });

  describe("GET /api/ollama/health", () => {
    it("returns connected:true when upstream responds ok", async () => {
      const mockOllama = await createMockOllama((req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ models: [] }));
      });

      try {
        const response = await fetch(`${proxy.url}/api/ollama/health`, {
          headers: {
            "x-ollama-url": mockOllama.url,
            "Content-Type": "application/json",
          },
        });

        const data = await response.json();
        expect(data.connected).toBe(true);
        expect(data.url).toBe(mockOllama.url);
      } finally {
        mockOllama.close();
      }
    });

    it("returns connected:false when upstream is unreachable", async () => {
      const response = await fetch(`${proxy.url}/api/ollama/health`, {
        headers: {
          "x-ollama-url": "http://127.0.0.1:19999", // nothing listening
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      expect(data.connected).toBe(false);
    });
  });

  describe("POST /api/ollama/chat", () => {
    it("proxies chat request and returns response", async () => {
      const mockOllama = await createMockOllama((req, res) => {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          const parsed = JSON.parse(body);
          expect(parsed.model).toBe("glm4:9b");
          expect(parsed.stream).toBe(false);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            model: "glm4:9b",
            message: { role: "assistant", content: "Hello!" },
            done: true,
          }));
        });
      });

      try {
        const response = await fetch(`${proxy.url}/api/ollama/chat`, {
          method: "POST",
          headers: {
            "x-ollama-url": mockOllama.url,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "glm4:9b",
            messages: [{ role: "user", content: "Hi" }],
          }),
        });

        expect(response.ok).toBe(true);
        const data = await response.json();
        expect(data.message.content).toBe("Hello!");
      } finally {
        mockOllama.close();
      }
    });
  });

  describe("POST /api/ollama/chat/stream", () => {
    it("streams response chunks from upstream", async () => {
      // The proxy sends the request to /api/chat with stream:true in the body
      const mockOllama = await createMockOllama((req, res) => {
        if (req.method === "POST" && req.url === "/api/chat") {
          let body = "";
          req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          req.on("end", () => {
            const parsed = JSON.parse(body);
            // The proxy sets stream: true
            expect(parsed.stream).toBe(true);
            res.writeHead(200, { "Content-Type": "application/x-ndjson" });
            res.write(JSON.stringify({ model: "glm4:9b", message: { role: "assistant", content: "Hel" }, done: false }) + "\n");
            setTimeout(() => {
              res.write(JSON.stringify({ model: "glm4:9b", message: { role: "assistant", content: "lo!" }, done: true }) + "\n");
              res.end();
            }, 50);
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      try {
        const response = await fetch(`${proxy.url}/api/ollama/chat/stream`, {
          method: "POST",
          headers: {
            "x-ollama-url": mockOllama.url,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "glm4:9b",
            messages: [{ role: "user", content: "Hi" }],
          }),
        });

        const text = await response.text();
        if (response.status !== 200) {
          console.log('Stream test got status', response.status, 'body:', text);
        }
        expect(response.status).toBe(200);
        const lines = text.trim().split("\n").filter(Boolean);
        expect(lines.length).toBe(2);

        const chunk1 = JSON.parse(lines[0]);
        expect(chunk1.message.content).toBe("Hel");
        expect(chunk1.done).toBe(false);

        const chunk2 = JSON.parse(lines[1]);
        expect(chunk2.message.content).toBe("lo!");
        expect(chunk2.done).toBe(true);
      } finally {
        mockOllama.close();
      }
    });
  });

  describe("cloud mode routing", () => {
    it("routes to ollama.com when x-ollama-url is 'cloud'", async () => {
      // We can't actually hit ollama.com in tests, but we can verify the health
      // endpoint returns the correct URL
      const response = await fetch(`${proxy.url}/api/ollama/health`, {
        headers: {
          "x-ollama-url": "cloud",
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      expect(data.url).toBe("https://ollama.com");
    });
  });
});
