import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { artifactsRouter } from "./routers/artifacts";
import { collectionsRouter } from "./routers/collections";
import { promptsRouter } from "./routers/prompts";
import { analyticsRouter } from "./routers/analytics";
import { presetsRouter } from "./routers/presets";
import { cacheRouter } from "./routers/cache";
import { favoritesRouter } from "./routers/favorites";
import { sharingRouter } from "./routers/sharing";
import { batchRouter } from "./routers/batch";
import { autoRetryRouter } from "./routers/autoRetry";
import { xaiGenRouter } from "./routers/xaiGen";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  artifacts: artifactsRouter,
  collections: collectionsRouter,
  prompts: promptsRouter,
  presets: presetsRouter,
  analytics: analyticsRouter,

  // Stage 2 of the universal merge — routers lifted from ux-llm-media.
  cache: cacheRouter,
  favorites: favoritesRouter,
  sharing: sharingRouter,
  batch: batchRouter,
  autoRetry: autoRetryRouter,
  // Registered as xaiGen (NOT xai) per merge blueprint Section 4: only the
  // generation procedures came over; chat stays on dreamer-proxy.
  xaiGen: xaiGenRouter,
});

export type AppRouter = typeof appRouter;
