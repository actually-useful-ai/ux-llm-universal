// ============================================================
// Download proxy — bypass CORS restrictions on external media
// URLs, SSRF-guarded. Lifted from ux-llm-media (Stage 2 of the
// universal merge); wrapped as a register function to match the
// glm proxy registration pattern in server/_core/index.ts.
// ============================================================

import type { Express } from "express";
import axios from "axios";
import { checkDownloadUrl } from "./_core/ssrf-guard";

/**
 * GET /api/download?url=<encoded_url>&filename=<optional_filename>
 *
 * This endpoint is publicly reachable and unauthenticated, so it is an SSRF
 * vector: it must only ever fetch real provider-CDN media. checkDownloadUrl
 * enforces an http(s)-only scheme, a private/loopback IP block (including a
 * DNS-resolution check), and a provider-CDN host allow-list.
 */
export function registerDownloadProxy(app: Express) {
  app.get("/api/download", async (req, res) => {
    const url = req.query.url as string;
    if (!url) {
      res.status(400).json({ error: "Missing url parameter" });
      return;
    }

    const check = await checkDownloadUrl(url);
    if (!check.ok) {
      res.status(400).json({ error: check.reason });
      return;
    }

    try {
      const response = await axios.get(check.url.toString(), {
        responseType: "arraybuffer",
        timeout: 60_000,
        maxContentLength: 500 * 1024 * 1024, // 500MB max
        // Do not let axios chase a 3xx into a blocked address; each hop must be
        // re-validated, so refuse redirects from the proxy entirely.
        maxRedirects: 0,
      });

      const contentType =
        response.headers["content-type"] || "application/octet-stream";
      const filename =
        (req.query.filename as string) || `grok-download-${Date.now()}`;

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", response.data.byteLength);
      res.send(Buffer.from(response.data));
    } catch (err: any) {
      console.error("[Download Proxy] Error:", err.message);
      res.status(502).json({ error: "Failed to download file" });
    }
  });
}
