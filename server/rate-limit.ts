// ============================================================
// Abuse throttling for public generation endpoints
// No auth wall — just rate limiting + concurrency backstop
// ============================================================
//
// The /api/* generation proxies (chat, image, video, tts, research)
// are public and unmetered. This middleware adds two lightweight,
// dependency-free guards:
//
//   1. Per-IP sliding window: ~30 requests / 10 minutes -> 429.
//      Keyed off X-Forwarded-For (we sit behind Caddy). Spoofable,
//      so it's the first line, not the last.
//   2. Global in-flight concurrency cap (~8) -> 503. This is the
//      spoof-proof backstop: it doesn't trust any client-supplied
//      header, it just counts how many expensive calls are running.
//
// State is in-memory (per process). On restart the windows reset;
// that's fine for abuse throttling.

import type { Request, Response, NextFunction } from 'express';

// --- Tunables -------------------------------------------------

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PER_WINDOW = 30; // requests per IP per window
const MAX_CONCURRENT = 8; // global in-flight expensive calls

// Path prefixes that count as expensive generation endpoints.
// Matched against req.path. Keep in sync with the proxy registrations
// in server/_core/index.ts (ollama/dreamer/image/video/tts/beltalowda).
const GENERATION_PATHS = [
  '/api/ollama/chat', // covers /api/ollama/chat and /api/ollama/chat/stream
  '/api/dreamer/chat/stream',
  '/api/image/generate',
  '/api/video/generate',
  '/api/tts/generate',
  '/api/beltalowda/start',
];

function isGenerationPath(path: string): boolean {
  return GENERATION_PATHS.some(p => path === p || path.startsWith(p + '/'));
}

// --- Client IP ------------------------------------------------
// Behind Caddy, the real client is the leftmost X-Forwarded-For entry.
// Fall back to the socket address when the header is absent.

function clientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  if (raw) {
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || 'unknown';
}

// --- Per-IP sliding window ------------------------------------
// Map<ip, timestamps[]>. Each entry is the list of request times still
// inside the window. Pruned lazily on each hit; a periodic sweep keeps
// idle IPs from leaking memory.

const hits = new Map<string, number[]>();

function checkRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const recent = (hits.get(ip) || []).filter(ts => ts > cutoff);

  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    const retryAfterSec = Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000));
    return { ok: false, retryAfterSec };
  }

  recent.push(now);
  hits.set(ip, recent);
  return { ok: true, retryAfterSec: 0 };
}

// Periodic sweep of empty/stale buckets (memory hygiene).
const sweep = setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  hits.forEach((timestamps: number[], ip: string) => {
    const recent = timestamps.filter((ts: number) => ts > cutoff);
    if (recent.length === 0) hits.delete(ip);
    else hits.set(ip, recent);
  });
}, WINDOW_MS);
sweep.unref?.(); // don't keep the process alive for the sweep

// --- Global concurrency cap -----------------------------------

let inFlight = 0;

/**
 * Express middleware: throttle public generation endpoints.
 * Mount BEFORE the generation proxies register their routes.
 * Non-generation paths pass straight through untouched.
 */
export function generationThrottle(req: Request, res: Response, next: NextFunction): void {
  if (!isGenerationPath(req.path)) {
    next();
    return;
  }

  // 1. Per-IP sliding window
  const ip = clientIp(req);
  const limit = checkRateLimit(ip);
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfterSec));
    res.status(429).json({
      error: 'Too many requests',
      details: `Rate limit exceeded. Try again in ${limit.retryAfterSec}s.`,
    });
    return;
  }

  // 2. Global concurrency cap (spoof-proof backstop)
  if (inFlight >= MAX_CONCURRENT) {
    res.setHeader('Retry-After', '5');
    res.status(503).json({
      error: 'Server busy',
      details: 'Too many generations in flight. Please retry shortly.',
    });
    return;
  }

  inFlight++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    inFlight = Math.max(0, inFlight - 1);
  };
  // Release on any terminal outcome: normal finish, client disconnect, or error.
  res.once('finish', release);
  res.once('close', release);
  res.once('error', release);

  next();
}
