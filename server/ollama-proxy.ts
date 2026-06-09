// ============================================================
// Ollama API Proxy — Server-side relay to bypass CORS
// Supports: Local, Remote, and Ollama Cloud (ollama.com)
// Routes: /api/ollama/*
// ============================================================

import type { Express, Request, Response } from 'express';
import { isIP } from 'node:net';

const OLLAMA_CLOUD_URL = 'https://ollama.com';
const DEFAULT_TIMEOUT = 120_000; // 2 minutes for long model responses

/**
 * Thrown when a client-supplied x-ollama-url points somewhere we refuse to
 * proxy (internal hosts, link-local/metadata, non-http schemes). Carries a
 * client-safe message; callers map it to HTTP 400.
 */
class TargetRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TargetRejectedError';
  }
}

// Hosts the proxy is always allowed to reach, regardless of the SSRF guard.
// The default Ollama cloud endpoint, plus an optional operator-configured
// host from the environment (OLLAMA_URL / OLLAMA_HOST). Compared by hostname.
function allowedHostnames(): Set<string> {
  const allowed = new Set<string>();
  const add = (raw: string | undefined) => {
    if (!raw) return;
    try {
      // Accept bare host:port or a full URL.
      const u = new URL(raw.includes('://') ? raw : `http://${raw}`);
      if (u.hostname) allowed.add(u.hostname.toLowerCase());
    } catch {
      /* ignore unparseable env value */
    }
  };
  add(OLLAMA_CLOUD_URL);
  add(process.env.OLLAMA_URL);
  add(process.env.OLLAMA_HOST);
  return allowed;
}

// Reject IPs that resolve to the host itself, private ranges, or
// link-local/cloud-metadata space. We only see the literal host string here
// (no DNS resolution at this layer), so this blocks literal-IP SSRF; the
// allow-list above is what gates hostnames.
function isBlockedIp(host: string): boolean {
  let ip = host;
  // Strip IPv6 brackets and zone id.
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  ip = ip.split('%')[0];

  const kind = isIP(ip);
  if (kind === 4) {
    const parts = ip.split('.').map(n => parseInt(n, 10));
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadata
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }
  if (kind === 6) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true; // loopback / unspecified
    if (low.startsWith('fe80')) return true; // link-local
    if (low.startsWith('fc') || low.startsWith('fd')) return true; // unique-local fc00::/7
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4 address.
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(low);
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }
  return false; // not an IP literal — hostname handling is the allow-list's job
}

/**
 * Validate a fully-resolved target URL against the SSRF allow-list.
 * Throws TargetRejectedError on anything we refuse to proxy.
 */
function assertTargetAllowed(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new TargetRejectedError('Invalid Ollama server URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TargetRejectedError('Only http and https Ollama URLs are allowed.');
  }

  const host = url.hostname.toLowerCase();

  // Explicit hostname allow-list (cloud + operator-configured host).
  if (allowedHostnames().has(host)) return;

  // Block obvious internal hostnames and any private/loopback IP literal.
  if (host === 'localhost' || host.endsWith('.localhost')) {
    throw new TargetRejectedError('Refusing to proxy to an internal host.');
  }
  if (isBlockedIp(host)) {
    throw new TargetRejectedError('Refusing to proxy to an internal or reserved address.');
  }
}

/**
 * Register Ollama proxy routes on the Express app.
 * All routes are under /api/ollama/ and relay to the target Ollama server.
 *
 * The frontend sends:
 *   - x-ollama-url: base URL of the Ollama server (or 'cloud' for ollama.com)
 *   - x-ollama-key: API key (optional, for cloud or authenticated servers)
 */
export function registerOllamaProxy(app: Express) {
  // Health check / list models
  app.get('/api/ollama/tags', async (req: Request, res: Response) => {
    try {
      const { baseUrl, headers } = resolveTarget(req);
      const response = await fetch(`${baseUrl}/api/tags`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        res.status(response.status).json({
          error: `Ollama returned ${response.status}`,
          details: text,
        });
        return;
      }

      const data = await response.json();
      res.json(data);
    } catch (err) {
      handleProxyError(err, res);
    }
  });

  // Chat endpoint (non-streaming)
  app.post('/api/ollama/chat', async (req: Request, res: Response) => {
    try {
      const { baseUrl, headers } = resolveTarget(req);
      const body = { ...req.body, stream: false };

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        res.status(response.status).json({
          error: `Ollama returned ${response.status}`,
          details: text,
        });
        return;
      }

      const data = await response.json();
      res.json(data);
    } catch (err) {
      handleProxyError(err, res);
    }
  });

  // Chat endpoint (streaming via SSE)
  app.post('/api/ollama/chat/stream', async (req: Request, res: Response) => {
    try {
      const { baseUrl, headers } = resolveTarget(req);
      const body = { ...req.body, stream: true };

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        res.status(response.status).json({
          error: `Ollama returned ${response.status}`,
          details: text,
        });
        return;
      }

      // Stream the response as newline-delimited JSON
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      if (!response.body) {
        res.status(500).json({ error: 'No response body from Ollama' });
        return;
      }

      try {
        // Use Web Streams API (Node 18+ supports this on fetch response bodies)
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
        reader.releaseLock();
      } catch (err) {
        // Fallback: try async iteration (Node.js ReadableStream)
        try {
          for await (const chunk of response.body as any) {
            res.write(typeof chunk === 'string' ? chunk : Buffer.from(chunk));
          }
        } catch {
          // Client disconnected or upstream error — just end
        }
      } finally {
        res.end();
      }
    } catch (err) {
      if (!res.headersSent) {
        handleProxyError(err, res);
      }
    }
  });

  // Server config — tells the frontend if a server-side API key is configured
  app.get('/api/ollama/config', (_req: Request, res: Response) => {
    const keyId = process.env.OLLAMA_KEY_ID || '';
    const keySecret = process.env.OLLAMA_KEY_SECRET || '';
    const hasKey = (keyId && keySecret) || (process.env.OLLAMA_API_KEY || '').length > 10;
    res.json({
      hasServerKey: hasKey,
      defaultMode: hasKey ? 'cloud' : 'local',
    });
  });

  // Connection test
  app.get('/api/ollama/health', async (req: Request, res: Response) => {
    let baseUrl: string;
    let headers: Record<string, string>;
    try {
      ({ baseUrl, headers } = resolveTarget(req));
    } catch (err) {
      // Rejected target (SSRF guard) or malformed URL — report as not connected
      // rather than re-resolving (which would re-throw).
      handleProxyError(err, res);
      return;
    }

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        headers,
        signal: AbortSignal.timeout(8_000),
      });

      res.json({
        connected: response.ok,
        status: response.status,
        url: baseUrl,
      });
    } catch {
      res.json({
        connected: false,
        status: 0,
        url: baseUrl,
      });
    }
  });
}

/**
 * Resolve the target Ollama server URL and auth headers from the request.
 */
function resolveTarget(req: Request): { baseUrl: string; headers: Record<string, string> } {
  const rawUrl = (req.headers['x-ollama-url'] as string) || '';
  const clientKey = (req.headers['x-ollama-key'] as string) || '';

  // Reconstruct the full Ollama API key from two-part env vars
  // (workaround: the env system truncates values at period characters)
  const keyId = process.env.OLLAMA_KEY_ID || '';
  const keySecret = process.env.OLLAMA_KEY_SECRET || '';
  const serverKey = keyId && keySecret ? `${keyId}.${keySecret}` : (process.env.OLLAMA_API_KEY || '');
  const apiKey = clientKey || serverKey;

  let baseUrl: string;
  if (!rawUrl || rawUrl === 'cloud' || rawUrl === OLLAMA_CLOUD_URL) {
    // No client header (or explicit cloud): keep the default behavior.
    baseUrl = OLLAMA_CLOUD_URL;
  } else {
    baseUrl = rawUrl.replace(/\/$/, '');
    // A client-supplied target must pass the SSRF allow-list before use.
    assertTargetAllowed(baseUrl);
  }

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return { baseUrl, headers };
}

/**
 * Handle proxy errors with user-friendly messages.
 */
function handleProxyError(err: unknown, res: Response) {
  if (err instanceof TargetRejectedError) {
    res.status(400).json({ error: 'Invalid Ollama server', details: err.message });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unknown proxy error';

  if (message.includes('timeout') || message.includes('TimeoutError')) {
    res.status(504).json({
      error: 'Connection timed out',
      details: 'Could not reach the Ollama server. Check the server address and make sure it is running.',
    });
  } else if (message.includes('ECONNREFUSED') || message.includes('fetch failed')) {
    res.status(502).json({
      error: 'Cannot connect to Ollama',
      details: 'The server refused the connection. Make sure Ollama is running and accessible.',
    });
  } else {
    res.status(500).json({
      error: 'Proxy error',
      details: message,
    });
  }
}
