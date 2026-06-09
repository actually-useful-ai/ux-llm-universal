import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  addFavorite,
  removeFavorite,
  removeFavoriteByCachedId,
  getFavorites,
  getFavoriteIds,
} from "../db";

export const favoritesRouter = router({
  /** Add a cached content item to favorites */
  add: protectedProcedure
    .input(
      z.object({
        cachedContentId: z.number(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return addFavorite({
        userId: ctx.user.id,
        cachedContentId: input.cachedContentId,
        note: input.note || null,
      });
    }),

  /** Remove a favorite by its own ID */
  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return removeFavorite(input.id, ctx.user.id);
    }),

  /** Toggle favorite on/off by cached content ID */
  toggle: protectedProcedure
    .input(
      z.object({
        cachedContentId: z.number(),
        note: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const removed = await removeFavoriteByCachedId(input.cachedContentId, ctx.user.id);
      if (removed) {
        return { favorited: false };
      }
      await addFavorite({
        userId: ctx.user.id,
        cachedContentId: input.cachedContentId,
        note: input.note || null,
      });
      return { favorited: true };
    }),

  /** List all favorites, optionally filtered by type */
  list: protectedProcedure
    .input(
      z.object({
        type: z.string().optional(),
        limit: z.number().min(1).max(200).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return getFavorites(ctx.user.id, input?.type, input?.limit || 100);
    }),

  /** Get set of all favorited cached content IDs for the current user */
  ids: protectedProcedure.query(async ({ ctx }) => {
    const idSet = await getFavoriteIds(ctx.user.id);
    return Array.from(idSet);
  }),
});
