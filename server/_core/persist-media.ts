// ============================================================
// persist-media — download generated media from a provider's
// temporary URL and save it under /home/coolhand/data/generated/
// so we own the durable URL. Single-user system; served by
// Caddy at /generated/* with immutable cache headers.
// ============================================================

import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const GENERATED_ROOT =
  process.env.GENERATED_ROOT || "/home/coolhand/data/generated";
const PUBLIC_PREFIX =
  process.env.GENERATED_PUBLIC_PREFIX || "/generated";
// Videos can be 50MB+; allow a generous timeout.
const FETCH_TIMEOUT_MS = 90_000;

export interface PersistedMedia {
  publicUrl: string;
  localPath: string;
  bytes: number;
  sourceUrl: string;
}

export interface PersistOptions {
  kind: "image" | "video";
  provider: string;
  ext?: string;
}

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

function extFromContentType(
  ct: string | null,
  kind: "image" | "video",
): string {
  if (ct) {
    const lower = ct.toLowerCase().split(";")[0].trim();
    if (CONTENT_TYPE_TO_EXT[lower]) return CONTENT_TYPE_TO_EXT[lower];
  }
  return kind === "video" ? "mp4" : "png";
}

function todayDir(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Download bytes from a temporary provider URL and save them under
 * GENERATED_ROOT/{kind}s/YYYY-MM-DD/<uuid>.<ext>. Returns the public
 * URL (served by Caddy) plus the local path for debugging.
 *
 * Throws on upstream non-2xx or network/disk failure. Callers should
 * decide whether to fall back to the upstream URL.
 */
export async function persistMediaFromUrl(
  sourceUrl: string,
  opts: PersistOptions,
): Promise<PersistedMedia> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let resp: Response;
  try {
    resp = await fetch(sourceUrl, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    throw new Error(
      `persistMediaFromUrl: upstream ${resp.status} for ${sourceUrl}`,
    );
  }
  const ext =
    opts.ext ||
    extFromContentType(resp.headers.get("content-type"), opts.kind);
  const buf = Buffer.from(await resp.arrayBuffer());
  const id = randomUUID();
  const dateDir = todayDir();
  const subDir = path.join(GENERATED_ROOT, `${opts.kind}s`, dateDir);
  await mkdir(subDir, { recursive: true });
  const filename = `${id}.${ext}`;
  const localPath = path.join(subDir, filename);
  await writeFile(localPath, buf);
  const publicUrl = `${PUBLIC_PREFIX}/${opts.kind}s/${dateDir}/${filename}`;
  return { publicUrl, localPath, bytes: buf.length, sourceUrl };
}

/**
 * Persist a base64-encoded payload (no upstream URL — e.g. Gemini's
 * inline image bytes or OpenAI gpt-image-1 b64_json). Same return
 * shape as persistMediaFromUrl.
 */
export async function persistMediaFromBase64(
  base64: string,
  opts: PersistOptions & { ext: string },
): Promise<PersistedMedia> {
  return persistMediaFromBuffer(Buffer.from(base64, "base64"), opts);
}

/**
 * Persist a raw Buffer (e.g. an authenticated fetch result the caller
 * already has in memory). Saves the bytes verbatim — no re-encoding.
 */
export async function persistMediaFromBuffer(
  buf: Buffer,
  opts: PersistOptions & { ext: string },
): Promise<PersistedMedia> {
  const id = randomUUID();
  const dateDir = todayDir();
  const subDir = path.join(GENERATED_ROOT, `${opts.kind}s`, dateDir);
  await mkdir(subDir, { recursive: true });
  const filename = `${id}.${opts.ext}`;
  const localPath = path.join(subDir, filename);
  await writeFile(localPath, buf);
  const publicUrl = `${PUBLIC_PREFIX}/${opts.kind}s/${dateDir}/${filename}`;
  return { publicUrl, localPath, bytes: buf.length, sourceUrl: "buffer" };
}
