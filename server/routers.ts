import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { artifactsRouter } from "./routers/artifacts";
import { collectionsRouter } from "./routers/collections";
import { promptsRouter } from "./routers/prompts";
import { analyticsRouter } from "./routers/analytics";
import { presetsRouter } from "./routers/presets";

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
});

export type AppRouter = typeof appRouter;
