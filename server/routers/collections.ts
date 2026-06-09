// ============================================================
// Collections Router — Group artifacts into named collections
//
// Stage 5b: now targets the unified `collection_items` table (which references
// `cached_content`) instead of the legacy `collection_artifacts` table. The
// procedure names and shapes are unchanged; `artifactId` in the input is now a
// cachedContent id, and items are read back from cachedContent. itemCount on the
// collection row is maintained on add/remove.
// ============================================================

import { z } from 'zod';
import { eq, desc, and, inArray, sql } from 'drizzle-orm';
import { publicProcedure, router } from '../_core/trpc';
import { getDb } from '../db';
import { collections, collectionItems, cachedContent } from '../../drizzle/schema';

export const collectionsRouter = router({
  list: publicProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const userId = ctx.user?.id ?? 0;
      return db.select()
        .from(collections)
        .where(eq(collections.userId, userId))
        .orderBy(desc(collections.createdAt));
    }),

  create: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(256),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const userId = ctx.user?.id ?? 0;
      const [result] = await db.insert(collections).values({
        userId,
        name: input.name,
        description: input.description ?? null,
      }).$returningId();
      return { id: result.id };
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(256).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.description !== undefined) updates.description = input.description;
      if (Object.keys(updates).length > 0) {
        await db.update(collections).set(updates).where(eq(collections.id, input.id));
      }
      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      await db.delete(collectionItems).where(eq(collectionItems.collectionId, input.id));
      await db.delete(collections).where(eq(collections.id, input.id));
      return { success: true };
    }),

  addItem: publicProcedure
    .input(z.object({ collectionId: z.number(), artifactId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const userId = ctx.user?.id ?? 0;
      // Idempotent: only insert + bump itemCount if not already a member.
      const existing = await db.select({ id: collectionItems.id })
        .from(collectionItems)
        .where(and(
          eq(collectionItems.collectionId, input.collectionId),
          eq(collectionItems.cachedContentId, input.artifactId),
        ))
        .limit(1);
      if (existing.length > 0) return { success: true };
      await db.insert(collectionItems).values({
        collectionId: input.collectionId,
        cachedContentId: input.artifactId,
        userId,
        position: 0,
      });
      await db.update(collections)
        .set({ itemCount: sql`${collections.itemCount} + 1` })
        .where(eq(collections.id, input.collectionId));
      return { success: true };
    }),

  removeItem: publicProcedure
    .input(z.object({ collectionId: z.number(), artifactId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const result = await db.delete(collectionItems)
        .where(and(
          eq(collectionItems.collectionId, input.collectionId),
          eq(collectionItems.cachedContentId, input.artifactId),
        ));
      if ((result[0] as { affectedRows?: number }).affectedRows) {
        await db.update(collections)
          .set({ itemCount: sql`GREATEST(0, ${collections.itemCount} - 1)` })
          .where(eq(collections.id, input.collectionId));
      }
      return { success: true };
    }),

  items: publicProcedure
    .input(z.object({ collectionId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const links = await db.select({ cachedContentId: collectionItems.cachedContentId })
        .from(collectionItems)
        .where(eq(collectionItems.collectionId, input.collectionId));
      if (links.length === 0) return [];
      const ids = links.map(l => l.cachedContentId);
      const rows = await db.select().from(cachedContent).where(inArray(cachedContent.id, ids));
      // Preserve the legacy artifact row shape (url / metadata-as-string) so the
      // CollectionsPage renderer keeps working without changes.
      return rows.map(row => {
        let meta: Record<string, unknown> | null = null;
        if (row.metadata && typeof row.metadata === 'object') {
          meta = row.metadata as Record<string, unknown>;
        } else if (typeof row.metadata === 'string') {
          try { meta = JSON.parse(row.metadata); } catch { meta = null; }
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
          metadata: meta ? JSON.stringify(meta) : null,
          createdAt: row.createdAt,
        };
      });
    }),
});
