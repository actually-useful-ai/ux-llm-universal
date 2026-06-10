import type { Express, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { getDb, getShowcaseItems } from './db';
import { cachedContent, shareLinks } from '../drizzle/schema';

// Stage 5b: these public routes now read the unified `cached_content` store.
// Two token formats resolve here:
//   - persisted share-link tokens (share_links rows: view counts, expiry,
//     showcase opt-in) — what the gallery mints since 2026-06-10
//   - legacy `art_<base36 id>` stateless tokens from links copied before that;
//     they decode straight to a cachedContent id and keep working read-only.
// The showcase reuses the media sharing router's showcase query (share_links
// opt-in) rather than re-deriving "showcase" from a favorite flag.

export function decodeLegacyToken(token: string): number | null {
  const match = /^art_([0-9a-z]+)$/i.exec(token.trim());
  if (!match) return null;
  const id = Number.parseInt(match[1], 36);
  return Number.isFinite(id) ? id : null;
}

// Map a cachedContent row into the `content` shape SharePage expects.
function toShareContent(row: typeof cachedContent.$inferSelect) {
  let meta: unknown = row.metadata;
  let provider: string | null = null;
  if (meta && typeof meta === 'object') {
    const m = meta as Record<string, unknown>;
    if (typeof m.provider === 'string') provider = m.provider;
  }
  return {
    id: row.id,
    type: row.type,
    contentUrl: row.contentUrl,
    prompt: row.prompt,
    model: row.model,
    provider,
    metadata: meta,
    title: row.title ?? row.prompt,
  };
}

export function registerPublicArtifactProxy(app: Express) {
  app.get('/api/share/:token', async (req: Request, res: Response) => {
    try {
      const token = req.params.token;
      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: 'Database not available' });
      }

      const legacyId = decodeLegacyToken(token);
      if (legacyId === null) {
        // Persisted share-link token.
        const linkRows = await db.select().from(shareLinks)
          .where(eq(shareLinks.token, token)).limit(1);
        const link = linkRows[0];
        if (!link) {
          return res.status(404).json({ error: 'Shared artifact not found' });
        }
        if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
          return res.status(410).json({ error: 'Share link expired' });
        }
        const contentRows = await db.select().from(cachedContent)
          .where(eq(cachedContent.id, link.cachedContentId)).limit(1);
        const content = contentRows[0];
        if (!content) {
          return res.status(404).json({ error: 'Shared artifact not found' });
        }
        void db.update(shareLinks)
          .set({ viewCount: sql`${shareLinks.viewCount} + 1` })
          .where(eq(shareLinks.id, link.id))
          .catch(() => { /* view counting is best-effort */ });
        return res.json({
          token: link.token,
          viewCount: link.viewCount + 1,
          sharedAt: link.createdAt,
          isShowcase: link.isShowcase === 1,
          content: toShareContent(content),
        });
      }

      const rows = await db.select().from(cachedContent).where(eq(cachedContent.id, legacyId)).limit(1);
      const row = rows[0];

      if (!row) {
        return res.status(404).json({ error: 'Shared artifact not found' });
      }

      return res.json({
        token,
        viewCount: 0,
        sharedAt: row.createdAt,
        content: toShareContent(row),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch shared artifact';
      return res.status(500).json({ error: message });
    }
  });

  app.get('/api/showcase', async (req: Request, res: Response) => {
    try {
      const limit = Number.parseInt(String(req.query.limit || '24'), 10);
      const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 24;
      const items = await getShowcaseItems(safeLimit);

      return res.json({
        items: items.map(item => {
          let provider: string | null = null;
          if (item.metadata && typeof item.metadata === 'object') {
            const m = item.metadata as Record<string, unknown>;
            if (typeof m.provider === 'string') provider = m.provider;
          }
          return {
            token: item.token,
            viewCount: item.viewCount,
            sharedAt: item.sharedAt,
            content: {
              type: item.type,
              contentUrl: item.contentUrl,
              prompt: item.prompt,
              model: item.model,
              provider,
              metadata: item.metadata,
              title: item.title ?? item.prompt,
            },
          };
        }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch showcase artifacts';
      return res.status(500).json({ error: message });
    }
  });
}
