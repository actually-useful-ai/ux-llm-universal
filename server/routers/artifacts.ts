// ============================================================
// Artifacts Router — CRUD for generated content (images, videos, audio, etc.)
//
// Stage 5b of the universal merge: this router is now a FACADE over the
// unified `cached_content` store (+ `favorites` join + `collection_items`).
// The legacy `artifacts` / `collection_artifacts` tables are gone. Every
// procedure name and input/output shape is preserved so the ~15 client
// consumers (ArtifactContext, GalleryPage, FavoritesPage, the Create panels,
// CollectionPickerDialog, public-artifact-proxy) keep working unchanged.
//
// Column mapping cachedContent → legacy artifact row the clients expect:
//   contentUrl            → url
//   metadata (JSON col)   → metadata (JSON *string*) with `provider` folded in
//   metadata.provider     → provider
//   favorites join row    → isFavorite (1/0, synthesized)
// ============================================================

import { z } from 'zod';
import { eq, desc, like, and, inArray, sql } from 'drizzle-orm';
import { publicProcedure, router } from '../_core/trpc';
import { getDb } from '../db';
import { cachedContent, favorites, collectionItems } from '../../drizzle/schema';

const ARTIFACT_TYPES = ['image', 'video', 'audio', 'document', 'report'] as const;

type CachedRow = typeof cachedContent.$inferSelect;

// Shape a cachedContent row into the legacy artifact row the clients read.
// `metadata` is emitted as a JSON *string* (clients call JSON.parse on it),
// and `provider` is surfaced as a top-level column lifted out of metadata.
function toArtifactRow(row: CachedRow, favoritedIds: Set<number>) {
  let meta: Record<string, unknown> | null = null;
  if (row.metadata && typeof row.metadata === 'object') {
    meta = row.metadata as Record<string, unknown>;
  } else if (typeof row.metadata === 'string') {
    try {
      meta = JSON.parse(row.metadata);
    } catch {
      meta = null;
    }
  }
  const provider = meta && typeof meta.provider === 'string' ? (meta.provider as string) : null;
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    url: row.contentUrl ?? '',
    prompt: row.prompt ?? null,
    provider,
    model: row.model ?? null,
    // Clients JSON.parse this, so keep it a string (or null).
    metadata: meta ? JSON.stringify(meta) : null,
    isFavorite: favoritedIds.has(row.id) ? 1 : 0,
    createdAt: row.createdAt,
  };
}

// Resolve which of the given cachedContent ids are favorited by this user.
async function loadFavoritedIds(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  ids: number[],
): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ cachedContentId: favorites.cachedContentId })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), inArray(favorites.cachedContentId, ids)));
  return new Set(rows.map(r => r.cachedContentId));
}

export const artifactsRouter = router({
  save: publicProcedure
    .input(z.object({
      type: z.enum(ARTIFACT_TYPES),
      url: z.string(),
      prompt: z.string().optional(),
      provider: z.string().optional(),
      model: z.string().optional(),
      metadata: z.string().optional(), // JSON string
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const userId = ctx.user?.id ?? 0;

      // Fold provider into the metadata JSON object so the unified store keeps
      // a single column. toArtifactRow lifts it back out on read.
      let metaObj: Record<string, unknown> = {};
      if (input.metadata) {
        try {
          const parsed = JSON.parse(input.metadata);
          if (parsed && typeof parsed === 'object') metaObj = parsed as Record<string, unknown>;
        } catch {
          metaObj = {};
        }
      }
      if (input.provider) metaObj.provider = input.provider;

      const [result] = await db.insert(cachedContent).values({
        userId,
        type: input.type,
        title: input.prompt ?? null,
        prompt: input.prompt ?? null,
        contentUrl: input.url,
        model: input.model ?? null,
        metadata: Object.keys(metaObj).length > 0 ? metaObj : null,
      }).$returningId();
      return { id: result.id };
    }),

  list: publicProcedure
    .input(z.object({
      type: z.enum(ARTIFACT_TYPES).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
      favoritesOnly: z.boolean().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const userId = ctx.user?.id ?? 0;

      const conditions = [];
      if (input.type) conditions.push(eq(cachedContent.type, input.type));
      if (input.search) {
        const escaped = input.search.replace(/[%_\\]/g, '\\$&');
        conditions.push(like(cachedContent.prompt, `%${escaped}%`));
      }

      // favoritesOnly is enforced via the favorites JOIN table for this user.
      if (input.favoritesOnly) {
        const baseWhere = conditions.length > 0 ? and(...conditions) : undefined;
        const rows = await db
          .select()
          .from(cachedContent)
          .innerJoin(favorites, eq(favorites.cachedContentId, cachedContent.id))
          .where(baseWhere ? and(eq(favorites.userId, userId), baseWhere) : eq(favorites.userId, userId))
          .orderBy(desc(cachedContent.createdAt))
          .limit(input.limit)
          .offset(input.offset);
        const countRows = await db
          .select({ count: sql<number>`count(*)` })
          .from(cachedContent)
          .innerJoin(favorites, eq(favorites.cachedContentId, cachedContent.id))
          .where(baseWhere ? and(eq(favorites.userId, userId), baseWhere) : eq(favorites.userId, userId));
        const favoritedIds = new Set(rows.map(r => r.cached_content.id));
        return {
          items: rows.map(r => toArtifactRow(r.cached_content, favoritedIds)),
          total: Number(countRows[0]?.count ?? 0),
        };
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, countResult] = await Promise.all([
        db.select()
          .from(cachedContent)
          .where(where)
          .orderBy(desc(cachedContent.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)` })
          .from(cachedContent)
          .where(where),
      ]);

      const favoritedIds = await loadFavoritedIds(db, userId, items.map(i => i.id));
      return {
        items: items.map(row => toArtifactRow(row, favoritedIds)),
        total: Number(countResult[0]?.count ?? 0),
      };
    }),

  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const userId = ctx.user?.id ?? 0;
      const rows = await db.select().from(cachedContent).where(eq(cachedContent.id, input.id)).limit(1);
      if (!rows[0]) return null;
      const favoritedIds = await loadFavoritedIds(db, userId, [rows[0].id]);
      return toArtifactRow(rows[0], favoritedIds);
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      // Remove dependent rows first, then the content itself.
      await db.delete(favorites).where(eq(favorites.cachedContentId, input.id));
      await db.delete(collectionItems).where(eq(collectionItems.cachedContentId, input.id));
      await db.delete(cachedContent).where(eq(cachedContent.id, input.id));
      return { success: true };
    }),

  toggleFavorite: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const userId = ctx.user?.id ?? 0;
      const existing = await db
        .select({ id: favorites.id })
        .from(favorites)
        .where(and(eq(favorites.cachedContentId, input.id), eq(favorites.userId, userId)))
        .limit(1);
      if (existing.length > 0) {
        await db.delete(favorites)
          .where(and(eq(favorites.cachedContentId, input.id), eq(favorites.userId, userId)));
        return { isFavorite: false };
      }
      await db.insert(favorites).values({ userId, cachedContentId: input.id, note: null });
      return { isFavorite: true };
    }),

  favorites: publicProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const userId = ctx.user?.id ?? 0;
      const rows = await db
        .select()
        .from(cachedContent)
        .innerJoin(favorites, eq(favorites.cachedContentId, cachedContent.id))
        .where(eq(favorites.userId, userId))
        .orderBy(desc(cachedContent.createdAt))
        .limit(input.limit);
      const favoritedIds = new Set(rows.map(r => r.cached_content.id));
      return rows.map(r => toArtifactRow(r.cached_content, favoritedIds));
    }),
});
