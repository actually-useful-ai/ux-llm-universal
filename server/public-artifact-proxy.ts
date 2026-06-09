import type { Express, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { getDb, getShowcaseItems } from './db';
import { cachedContent } from '../drizzle/schema';

// Stage 5b: these public routes now read the unified `cached_content` store.
// `art_<base36 id>` tokens decode to a cachedContent id (ids are unified across
// the merge), and the showcase reuses the media sharing router's showcase query
// (share_links opt-in) rather than re-deriving "showcase" from a favorite flag.

function decodeToken(token: string): number | null {
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
      const contentId = decodeToken(req.params.token);
      if (!contentId) {
        return res.status(400).json({ error: 'Invalid share token' });
      }

      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: 'Database not available' });
      }

      const rows = await db.select().from(cachedContent).where(eq(cachedContent.id, contentId)).limit(1);
      const row = rows[0];

      if (!row) {
        return res.status(404).json({ error: 'Shared artifact not found' });
      }

      return res.json({
        token: req.params.token,
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
