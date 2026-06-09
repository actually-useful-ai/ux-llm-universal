import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/** When OAuth is not configured, auto-provision a local admin user. */
async function getOrCreateLocalAdmin(): Promise<User | null> {
  const ownerOpenId = ENV.ownerOpenId || "local-admin";
  const existing = await db.getUserByOpenId(ownerOpenId);
  if (existing) return existing;

  await db.upsertUser({
    openId: ownerOpenId,
    name: "Admin",
    role: "admin",
    lastSignedIn: new Date(),
  });
  return (await db.getUserByOpenId(ownerOpenId)) ?? null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // If OAuth is not configured, bypass auth with a local admin user
  if (!ENV.oAuthServerUrl) {
    user = await getOrCreateLocalAdmin();
  } else {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch (error) {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
