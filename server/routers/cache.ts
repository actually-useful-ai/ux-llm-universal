import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  saveCachedContent,
  getCachedContentByType,
  getCachedContentById,
  deleteCachedContent,
  clearCachedContentByType,
  clearAllCachedContent,
  getAllCachedContent,
} from "../db";

export const cacheRouter = router({
  // Save a new cached content item
  save: protectedProcedure
    .input(
      z.object({
        type: z.enum(["chat", "image", "image_edit", "video", "video_edit", "tts"]),
        title: z.string().optional(),
        prompt: z.string().optional(),
        contentUrl: z.string().optional(),
        metadata: z.any().optional(),
        model: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const item = await saveCachedContent({
        userId: ctx.user.id,
        type: input.type,
        title: input.title || null,
        prompt: input.prompt || null,
        contentUrl: input.contentUrl || null,
        metadata: input.metadata || null,
        model: input.model || null,
      });
      return item;
    }),

  // List cached content by type
  list: protectedProcedure
    .input(
      z.object({
        type: z.enum(["chat", "image", "image_edit", "video", "video_edit", "tts"]),
        limit: z.number().min(1).max(200).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await getCachedContentByType(ctx.user.id, input.type, input.limit ?? 50);
      return items;
    }),

  // Get a single cached content item
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const item = await getCachedContentById(input.id, ctx.user.id);
      return item ?? null;
    }),

  // Delete a single cached content item
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const success = await deleteCachedContent(input.id, ctx.user.id);
      return { success };
    }),

  // Clear all cached content of a specific type
  clearByType: protectedProcedure
    .input(
      z.object({
        type: z.enum(["chat", "image", "image_edit", "video", "video_edit", "tts"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const count = await clearCachedContentByType(ctx.user.id, input.type);
      return { deleted: count };
    }),

  // Clear ALL cached content
  clearAll: protectedProcedure.mutation(async ({ ctx }) => {
    const count = await clearAllCachedContent(ctx.user.id);
    return { deleted: count };
  }),

  // Gallery: get all content with filtering and pagination
  gallery: protectedProcedure
    .input(
      z.object({
        types: z.array(z.string()).optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).optional(),
        offset: z.number().min(0).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return getAllCachedContent(ctx.user.id, {
        types: input?.types,
        search: input?.search,
        limit: input?.limit ?? 50,
        offset: input?.offset ?? 0,
      });
    }),
});
