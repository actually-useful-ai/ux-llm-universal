import { z } from "zod";
import { randomBytes } from "crypto";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  createShareLink,
  getShareLinkByToken,
  getShareLinksByCachedId,
  incrementShareLinkViewCount,
  deleteShareLink,
  getShowcaseItems,
  getCachedContentById,
} from "../db";

export const sharingRouter = router({
  // Create a share link for a gallery item
  create: protectedProcedure
    .input(z.object({
      cachedContentId: z.number().int().positive(),
      isShowcase: z.boolean().default(false),
      expiresInDays: z.number().int().min(1).max(365).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the user owns this content
      const content = await getCachedContentById(input.cachedContentId, ctx.user.id);
      if (!content) throw new Error("Content not found or unauthorized");

      const token = randomBytes(24).toString("base64url");
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

      const link = await createShareLink({
        userId: ctx.user.id,
        cachedContentId: input.cachedContentId,
        token,
        isShowcase: input.isShowcase ? 1 : 0,
        viewCount: 0,
        expiresAt: expiresAt ?? undefined,
      });

      return { token: link.token, id: link.id };
    }),

  // Get all share links for a cached content item
  getForItem: protectedProcedure
    .input(z.object({ cachedContentId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return getShareLinksByCachedId(input.cachedContentId, ctx.user.id);
    }),

  // Delete a share link
  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const ok = await deleteShareLink(input.id, ctx.user.id);
      return { success: ok };
    }),

  // Public: view a shared item by token (no auth required)
  view: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const link = await getShareLinkByToken(input.token);
      if (!link) throw new Error("Share link not found");

      // Check expiry
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        throw new Error("Share link has expired");
      }

      // Increment view count (fire and forget)
      incrementShareLinkViewCount(input.token).catch(() => {});

      // Get the content (no userId check since this is public)
      const { getDb } = await import("../db");
      const { cachedContent } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const rows = await db
        .select()
        .from(cachedContent)
        .where(eq(cachedContent.id, link.cachedContentId))
        .limit(1);

      if (!rows[0]) throw new Error("Content not found");

      return {
        content: rows[0],
        viewCount: link.viewCount + 1,
        isShowcase: link.isShowcase === 1,
        sharedAt: link.createdAt,
      };
    }),

  // Public: get showcase items (opted-in public before/after)
  showcase: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(48) }))
    .query(async ({ input }) => {
      return getShowcaseItems(input.limit);
    }),
});
