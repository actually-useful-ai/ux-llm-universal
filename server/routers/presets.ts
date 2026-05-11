import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { exportPresets } from '../../drizzle/schema';
import { getDb } from '../db';
import { publicProcedure, router } from '../_core/trpc';

const VALID_FEATURES = ['image_gen', 'image_edit', 'video_gen', 'video_edit', 'tts'] as const;

async function ensureExportPresetsTable() {
  const db = await getDb();
  if (!db) return null;

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS export_presets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      feature VARCHAR(32) NOT NULL,
      name VARCHAR(128) NOT NULL,
      settings JSON NOT NULL,
      isDefault INT NOT NULL DEFAULT 0,
      useCount INT NOT NULL DEFAULT 0,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `));

  return db;
}

export const presetsRouter = router({
  list: publicProcedure
    .input(z.object({ feature: z.enum(VALID_FEATURES) }))
    .query(async ({ ctx, input }) => {
      const db = await ensureExportPresetsTable();
      if (!db) return [];
      const userId = ctx.user?.id ?? 0;

      return db.select()
        .from(exportPresets)
        .where(and(
          eq(exportPresets.userId, userId),
          eq(exportPresets.feature, input.feature),
        ))
        .orderBy(desc(exportPresets.isDefault), desc(exportPresets.updatedAt));
    }),

  save: publicProcedure
    .input(z.object({
      feature: z.enum(VALID_FEATURES),
      name: z.string().min(1).max(128),
      settings: z.record(z.string(), z.unknown()),
      isDefault: z.boolean().default(false).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await ensureExportPresetsTable();
      if (!db) throw new Error('Database not available');
      const userId = ctx.user?.id ?? 0;

      if (input.isDefault) {
        await db.update(exportPresets)
          .set({ isDefault: 0 })
          .where(and(
            eq(exportPresets.userId, userId),
            eq(exportPresets.feature, input.feature),
          ));
      }

      const [result] = await db.insert(exportPresets).values({
        userId,
        feature: input.feature,
        name: input.name,
        settings: input.settings,
        isDefault: input.isDefault ? 1 : 0,
        useCount: 0,
      }).$returningId();

      return { id: result.id };
    }),

  update: publicProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(1).max(128).optional(),
      settings: z.record(z.string(), z.unknown()).optional(),
      isDefault: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await ensureExportPresetsTable();
      if (!db) throw new Error('Database not available');
      const userId = ctx.user?.id ?? 0;

      const existing = await db.select()
        .from(exportPresets)
        .where(and(
          eq(exportPresets.id, input.id),
          eq(exportPresets.userId, userId),
        ))
        .limit(1);

      const preset = existing[0];
      if (!preset) throw new Error('Preset not found');

      if (input.isDefault) {
        await db.update(exportPresets)
          .set({ isDefault: 0 })
          .where(and(
            eq(exportPresets.userId, userId),
            eq(exportPresets.feature, preset.feature),
          ));
      }

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.settings !== undefined) updates.settings = input.settings;
      if (input.isDefault !== undefined) updates.isDefault = input.isDefault ? 1 : 0;

      if (Object.keys(updates).length > 0) {
        await db.update(exportPresets)
          .set(updates)
          .where(and(
            eq(exportPresets.id, input.id),
            eq(exportPresets.userId, userId),
          ));
      }

      return { success: true };
    }),

  delete: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await ensureExportPresetsTable();
      if (!db) throw new Error('Database not available');
      const userId = ctx.user?.id ?? 0;

      await db.delete(exportPresets)
        .where(and(
          eq(exportPresets.id, input.id),
          eq(exportPresets.userId, userId),
        ));

      return { success: true };
    }),

  use: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await ensureExportPresetsTable();
      if (!db) throw new Error('Database not available');
      const userId = ctx.user?.id ?? 0;

      await db.update(exportPresets)
        .set({ useCount: sql`${exportPresets.useCount} + 1` })
        .where(and(
          eq(exportPresets.id, input.id),
          eq(exportPresets.userId, userId),
        ));

      return { success: true };
    }),
});
