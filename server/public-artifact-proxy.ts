import type { Express, Request, Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { artifacts } from '../drizzle/schema';

function encodeToken(id: number): string {
  return `art_${id.toString(36)}`;
}

function decodeToken(token: string): number | null {
  const match = /^art_([0-9a-z]+)$/i.exec(token.trim());
  if (!match) return null;
  const id = Number.parseInt(match[1], 36);
  return Number.isFinite(id) ? id : null;
}

export function registerPublicArtifactProxy(app: Express) {
  app.get('/api/share/:token', async (req: Request, res: Response) => {
    try {
      const artifactId = decodeToken(req.params.token);
      if (!artifactId) {
        return res.status(400).json({ error: 'Invalid share token' });
      }

      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: 'Database not available' });
      }

      const rows = await db.select().from(artifacts).where(eq(artifacts.id, artifactId)).limit(1);
      const artifact = rows[0];

      if (!artifact) {
        return res.status(404).json({ error: 'Shared artifact not found' });
      }

      return res.json({
        token: req.params.token,
        viewCount: 0,
        sharedAt: artifact.createdAt,
        content: {
          id: artifact.id,
          type: artifact.type,
          contentUrl: artifact.url,
          prompt: artifact.prompt,
          model: artifact.model,
          provider: artifact.provider,
          metadata: artifact.metadata,
          title: artifact.prompt,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch shared artifact';
      return res.status(500).json({ error: message });
    }
  });

  app.get('/api/showcase', async (req: Request, res: Response) => {
    try {
      const limit = Number.parseInt(String(req.query.limit || '24'), 10);
      const db = await getDb();
      if (!db) {
        return res.status(503).json({ error: 'Database not available' });
      }

      const rows = await db.select()
        .from(artifacts)
        .where(eq(artifacts.isFavorite, 1))
        .orderBy(desc(artifacts.createdAt))
        .limit(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 24);

      return res.json({
        items: rows.map(artifact => ({
          id: artifact.id,
          token: encodeToken(artifact.id),
          viewCount: 0,
          sharedAt: artifact.createdAt,
          content: {
            id: artifact.id,
            type: artifact.type,
            contentUrl: artifact.url,
            prompt: artifact.prompt,
            model: artifact.model,
            provider: artifact.provider,
            metadata: artifact.metadata,
            title: artifact.prompt,
          },
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch showcase artifacts';
      return res.status(500).json({ error: message });
    }
  });
}
