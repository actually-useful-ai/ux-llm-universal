import { eq, and, desc, sql, gte, inArray, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  cachedContent, InsertCachedContent, CachedContent,
  savedPrompts, InsertSavedPrompt, SavedPrompt,
  rewriteRules, InsertRewriteRule, RewriteRule,
  usageLog, UsageLogEntry,
  favorites, InsertFavorite, Favorite,
  collections, InsertCollection, Collection,
  collectionItems, InsertCollectionItem, CollectionItem,
  exportPresets, InsertExportPreset, ExportPreset,
  shareLinks, InsertShareLink, ShareLink,
} from "../drizzle/schema";
import { ENV } from './_core/env';

// glm's schema exports UsageLogEntry (media called it UsageLog); the insert
// type was never exported, so derive it here.
type InsertUsageLog = typeof usageLog.$inferInsert;

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Cached Content Queries ─────────────────────────────────────────────

export async function saveCachedContent(item: InsertCachedContent): Promise<CachedContent> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(cachedContent).values(item);
  const insertId = result[0].insertId;
  const rows = await db.select().from(cachedContent).where(eq(cachedContent.id, insertId)).limit(1);
  return rows[0];
}

export async function getCachedContentByType(userId: number, type: string, limit = 50): Promise<CachedContent[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(cachedContent)
    .where(and(eq(cachedContent.userId, userId), eq(cachedContent.type, type)))
    .orderBy(desc(cachedContent.createdAt))
    .limit(limit);
}

export async function getCachedContentById(id: number, userId: number): Promise<CachedContent | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(cachedContent)
    .where(and(eq(cachedContent.id, id), eq(cachedContent.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function deleteCachedContent(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .delete(cachedContent)
    .where(and(eq(cachedContent.id, id), eq(cachedContent.userId, userId)));
  return (result[0] as any).affectedRows > 0;
}

export async function clearCachedContentByType(userId: number, type: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .delete(cachedContent)
    .where(and(eq(cachedContent.userId, userId), eq(cachedContent.type, type)));
  return (result[0] as any).affectedRows;
}

export async function getAllCachedContent(
  userId: number,
  options?: { types?: string[]; search?: string; limit?: number; offset?: number }
): Promise<{ items: CachedContent[]; total: number }> {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };

  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  const conditions: any[] = [eq(cachedContent.userId, userId)];

  // Filter by types (exclude chat by default)
  if (options?.types && options.types.length > 0) {
    conditions.push(inArray(cachedContent.type, options.types));
  } else {
    conditions.push(inArray(cachedContent.type, ["image", "image_edit", "video", "video_edit", "tts"]));
  }

  // Search in title and prompt
  if (options?.search) {
    const searchTerm = `%${options.search}%`;
    conditions.push(
      or(
        like(cachedContent.title, searchTerm),
        like(cachedContent.prompt, searchTerm)
      )
    );
  }

  const whereClause = and(...conditions);

  const [items, countResult] = await Promise.all([
    db
      .select()
      .from(cachedContent)
      .where(whereClause)
      .orderBy(desc(cachedContent.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(cachedContent)
      .where(whereClause),
  ]);

  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function clearAllCachedContent(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .delete(cachedContent)
    .where(eq(cachedContent.userId, userId));
  return (result[0] as any).affectedRows;
}

// ─── Saved Prompts Queries ──────────────────────────────────────────────

export async function savePrompt(item: InsertSavedPrompt): Promise<SavedPrompt> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(savedPrompts).values(item);
  const insertId = result[0].insertId;
  const rows = await db.select().from(savedPrompts).where(eq(savedPrompts.id, insertId)).limit(1);
  return rows[0];
}

export async function getPromptsByCategory(userId: number, category: string, limit = 100): Promise<SavedPrompt[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(savedPrompts)
    .where(and(eq(savedPrompts.userId, userId), eq(savedPrompts.category, category)))
    .orderBy(desc(savedPrompts.useCount), desc(savedPrompts.createdAt))
    .limit(limit);
}

export async function getAllPrompts(userId: number, limit = 200): Promise<SavedPrompt[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(savedPrompts)
    .where(eq(savedPrompts.userId, userId))
    .orderBy(desc(savedPrompts.useCount), desc(savedPrompts.createdAt))
    .limit(limit);
}

export async function incrementPromptUseCount(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(savedPrompts)
    .set({ useCount: sql`${savedPrompts.useCount} + 1` })
    .where(and(eq(savedPrompts.id, id), eq(savedPrompts.userId, userId)));
}

export async function deletePrompt(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .delete(savedPrompts)
    .where(and(eq(savedPrompts.id, id), eq(savedPrompts.userId, userId)));
  return (result[0] as any).affectedRows > 0;
}

export async function clearPromptsByCategory(userId: number, category: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const result = await db
    .delete(savedPrompts)
    .where(and(eq(savedPrompts.userId, userId), eq(savedPrompts.category, category)));
  return (result[0] as any).affectedRows;
}

// ─── Rewrite Rules Queries ──────────────────────────────────────────────

export async function saveRewriteRule(item: InsertRewriteRule): Promise<RewriteRule> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(rewriteRules).values(item);
  const insertId = result[0].insertId;
  const rows = await db.select().from(rewriteRules).where(eq(rewriteRules.id, insertId)).limit(1);
  return rows[0];
}

export async function getRewriteRules(userId: number, category: string, limit = 50): Promise<RewriteRule[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(rewriteRules)
    .where(and(eq(rewriteRules.userId, userId), eq(rewriteRules.category, category)))
    .orderBy(desc(rewriteRules.createdAt))
    .limit(limit);
}

export async function getAllRewriteRules(userId: number, limit = 100): Promise<RewriteRule[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(rewriteRules)
    .where(eq(rewriteRules.userId, userId))
    .orderBy(desc(rewriteRules.createdAt))
    .limit(limit);
}

// ─── Usage Analytics Queries ────────────────────────────────────────────

export async function logUsage(item: InsertUsageLog): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db.insert(usageLog).values(item);
}

export async function getUsageSummary(userId: number, daysBack = 30) {
  const db = await getDb();
  if (!db) return [];

  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  return db
    .select({
      feature: usageLog.feature,
      totalCalls: sql<number>`COUNT(*)`,
      totalItems: sql<number>`COALESCE(SUM(${usageLog.itemCount}), 0)`,
      totalPromptTokens: sql<number>`COALESCE(SUM(${usageLog.promptTokens}), 0)`,
      totalCompletionTokens: sql<number>`COALESCE(SUM(${usageLog.completionTokens}), 0)`,
      successCount: sql<number>`SUM(CASE WHEN ${usageLog.success} = 1 THEN 1 ELSE 0 END)`,
      failCount: sql<number>`SUM(CASE WHEN ${usageLog.success} = 0 THEN 1 ELSE 0 END)`,
      avgDurationMs: sql<number>`COALESCE(AVG(${usageLog.durationMs}), 0)`,
    })
    .from(usageLog)
    .where(and(eq(usageLog.userId, userId), gte(usageLog.createdAt, since)))
    .groupBy(usageLog.feature);
}

export async function getUsageTimeline(userId: number, daysBack = 30) {
  const db = await getDb();
  if (!db) return [];

  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  return db
    .select({
      date: sql<string>`DATE(${usageLog.createdAt})`,
      feature: usageLog.feature,
      count: sql<number>`COUNT(*)`,
      items: sql<number>`COALESCE(SUM(${usageLog.itemCount}), 0)`,
      tokens: sql<number>`COALESCE(SUM(${usageLog.promptTokens}) + SUM(${usageLog.completionTokens}), 0)`,
    })
    .from(usageLog)
    .where(and(eq(usageLog.userId, userId), gte(usageLog.createdAt, since)))
    .groupBy(sql`DATE(${usageLog.createdAt})`, usageLog.feature)
    .orderBy(sql`DATE(${usageLog.createdAt})`);
}

export async function getRecentUsage(userId: number, limit = 50): Promise<UsageLogEntry[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(usageLog)
    .where(eq(usageLog.userId, userId))
    .orderBy(desc(usageLog.createdAt))
    .limit(limit);
}

// ─── Favorites Queries ─────────────────────────────────────────────────

export async function addFavorite(item: InsertFavorite): Promise<Favorite> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(favorites).values(item);
  const insertId = result[0].insertId;
  const rows = await db.select().from(favorites).where(eq(favorites.id, insertId)).limit(1);
  return rows[0];
}

export async function removeFavorite(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .delete(favorites)
    .where(and(eq(favorites.id, id), eq(favorites.userId, userId)));
  return (result[0] as any).affectedRows > 0;
}

export async function removeFavoriteByCachedId(cachedContentId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .delete(favorites)
    .where(and(eq(favorites.cachedContentId, cachedContentId), eq(favorites.userId, userId)));
  return (result[0] as any).affectedRows > 0;
}

export async function getFavorites(userId: number, type?: string, limit = 100) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(favorites.userId, userId)];
  if (type) {
    conditions.push(eq(cachedContent.type, type));
  }

  return db
    .select({
      id: favorites.id,
      cachedContentId: favorites.cachedContentId,
      note: favorites.note,
      favoritedAt: favorites.createdAt,
      type: cachedContent.type,
      title: cachedContent.title,
      prompt: cachedContent.prompt,
      contentUrl: cachedContent.contentUrl,
      metadata: cachedContent.metadata,
      model: cachedContent.model,
      createdAt: cachedContent.createdAt,
    })
    .from(favorites)
    .innerJoin(cachedContent, eq(favorites.cachedContentId, cachedContent.id))
    .where(and(...conditions))
    .orderBy(desc(favorites.createdAt))
    .limit(limit);
}

export async function isFavorited(cachedContentId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const rows = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.cachedContentId, cachedContentId), eq(favorites.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function getFavoriteIds(userId: number): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();

  const rows = await db
    .select({ cachedContentId: favorites.cachedContentId })
    .from(favorites)
    .where(eq(favorites.userId, userId));
  return new Set(rows.map(r => r.cachedContentId));
}

// ─── Collections Queries ───────────────────────────────────────────────────

export async function createCollection(item: InsertCollection): Promise<Collection> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(collections).values(item);
  const insertId = result[0].insertId;
  const rows = await db.select().from(collections).where(eq(collections.id, insertId)).limit(1);
  return rows[0];
}

export async function getCollections(userId: number): Promise<Collection[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(desc(collections.updatedAt));
}

export async function getCollectionById(id: number, userId: number): Promise<Collection | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, id), eq(collections.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function updateCollection(id: number, userId: number, updates: Partial<InsertCollection>): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .update(collections)
    .set(updates)
    .where(and(eq(collections.id, id), eq(collections.userId, userId)));
  return (result[0] as any).affectedRows > 0;
}

export async function deleteCollection(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Delete all items first
  await db.delete(collectionItems).where(and(eq(collectionItems.collectionId, id), eq(collectionItems.userId, userId)));
  const result = await db.delete(collections).where(and(eq(collections.id, id), eq(collections.userId, userId)));
  return (result[0] as any).affectedRows > 0;
}

export async function addToCollection(item: InsertCollectionItem): Promise<CollectionItem> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if already in collection
  const existing = await db
    .select()
    .from(collectionItems)
    .where(and(
      eq(collectionItems.collectionId, item.collectionId),
      eq(collectionItems.cachedContentId, item.cachedContentId),
    ))
    .limit(1);
  if (existing.length > 0) return existing[0];

  const result = await db.insert(collectionItems).values(item);
  const insertId = result[0].insertId;
  const rows = await db.select().from(collectionItems).where(eq(collectionItems.id, insertId)).limit(1);

  // Update item count
  await db
    .update(collections)
    .set({ itemCount: sql`${collections.itemCount} + 1` })
    .where(eq(collections.id, item.collectionId));

  return rows[0];
}

export async function removeFromCollection(collectionId: number, cachedContentId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .delete(collectionItems)
    .where(and(
      eq(collectionItems.collectionId, collectionId),
      eq(collectionItems.cachedContentId, cachedContentId),
      eq(collectionItems.userId, userId),
    ));
  const affected = (result[0] as any).affectedRows;

  if (affected > 0) {
    await db
      .update(collections)
      .set({ itemCount: sql`GREATEST(0, ${collections.itemCount} - 1)` })
      .where(eq(collections.id, collectionId));
  }
  return affected > 0;
}

export async function getCollectionItems(collectionId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: collectionItems.id,
      collectionId: collectionItems.collectionId,
      cachedContentId: collectionItems.cachedContentId,
      position: collectionItems.position,
      addedAt: collectionItems.addedAt,
      type: cachedContent.type,
      title: cachedContent.title,
      prompt: cachedContent.prompt,
      contentUrl: cachedContent.contentUrl,
      metadata: cachedContent.metadata,
      model: cachedContent.model,
      createdAt: cachedContent.createdAt,
    })
    .from(collectionItems)
    .innerJoin(cachedContent, eq(collectionItems.cachedContentId, cachedContent.id))
    .where(and(eq(collectionItems.collectionId, collectionId), eq(collectionItems.userId, userId)))
    .orderBy(collectionItems.position, collectionItems.addedAt);
}

export async function getItemCollectionIds(cachedContentId: number, userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({ collectionId: collectionItems.collectionId })
    .from(collectionItems)
    .where(and(eq(collectionItems.cachedContentId, cachedContentId), eq(collectionItems.userId, userId)));
  return rows.map(r => r.collectionId);
}

// ─── Export Presets Queries ────────────────────────────────────────────────

export async function savePreset(item: InsertExportPreset): Promise<ExportPreset> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(exportPresets).values(item);
  const insertId = result[0].insertId;
  const rows = await db.select().from(exportPresets).where(eq(exportPresets.id, insertId)).limit(1);
  return rows[0];
}

export async function getPresets(userId: number, feature: string): Promise<ExportPreset[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(exportPresets)
    .where(and(eq(exportPresets.userId, userId), eq(exportPresets.feature, feature)))
    .orderBy(desc(exportPresets.useCount), desc(exportPresets.createdAt));
}

export async function updatePreset(id: number, userId: number, updates: Partial<InsertExportPreset>): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .update(exportPresets)
    .set(updates)
    .where(and(eq(exportPresets.id, id), eq(exportPresets.userId, userId)));
  return (result[0] as any).affectedRows > 0;
}

export async function deletePreset(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .delete(exportPresets)
    .where(and(eq(exportPresets.id, id), eq(exportPresets.userId, userId)));
  return (result[0] as any).affectedRows > 0;
}

export async function incrementPresetUseCount(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(exportPresets)
    .set({ useCount: sql`${exportPresets.useCount} + 1` })
    .where(and(eq(exportPresets.id, id), eq(exportPresets.userId, userId)));
}

// ─── Share Links Queries ───────────────────────────────────────────────────

export async function createShareLink(item: InsertShareLink): Promise<ShareLink> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(shareLinks).values(item);
  const insertId = result[0].insertId;
  const rows = await db.select().from(shareLinks).where(eq(shareLinks.id, insertId)).limit(1);
  return rows[0];
}

export async function getShareLinkByToken(token: string): Promise<ShareLink | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.token, token))
    .limit(1);
  return rows[0];
}

export async function getShareLinksByCachedId(cachedContentId: number, userId: number): Promise<ShareLink[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.cachedContentId, cachedContentId), eq(shareLinks.userId, userId)));
}

export async function incrementShareLinkViewCount(token: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(shareLinks)
    .set({ viewCount: sql`${shareLinks.viewCount} + 1` })
    .where(eq(shareLinks.token, token));
}

export async function deleteShareLink(id: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const result = await db
    .delete(shareLinks)
    .where(and(eq(shareLinks.id, id), eq(shareLinks.userId, userId)));
  return (result[0] as any).affectedRows > 0;
}

export async function getShowcaseItems(limit = 50) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      token: shareLinks.token,
      viewCount: shareLinks.viewCount,
      sharedAt: shareLinks.createdAt,
      type: cachedContent.type,
      title: cachedContent.title,
      prompt: cachedContent.prompt,
      contentUrl: cachedContent.contentUrl,
      metadata: cachedContent.metadata,
      model: cachedContent.model,
    })
    .from(shareLinks)
    .innerJoin(cachedContent, eq(shareLinks.cachedContentId, cachedContent.id))
    .where(eq(shareLinks.isShowcase, 1))
    .orderBy(desc(shareLinks.viewCount))
    .limit(limit);
}
