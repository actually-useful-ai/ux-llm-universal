import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── Cached Content (unified artifact store) ────────────────────
export const cachedContent = mysqlTable("cached_content", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  title: text("title"),
  prompt: text("prompt"),
  contentUrl: text("contentUrl"),
  metadata: json("metadata"),
  model: varchar("model", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CachedContent = typeof cachedContent.$inferSelect;
export type InsertCachedContent = typeof cachedContent.$inferInsert;

// ── Collections ─────────────────────────────────────────────────
export const collections = mysqlTable("collections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  coverImageUrl: text("coverImageUrl"),
  itemCount: int("itemCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Collection = typeof collections.$inferSelect;
export type InsertCollection = typeof collections.$inferInsert;

// Junction table: items in a collection (references cachedContent).
export const collectionItems = mysqlTable("collection_items", {
  id: int("id").autoincrement().primaryKey(),
  collectionId: int("collectionId").notNull(),
  cachedContentId: int("cachedContentId").notNull(),
  userId: int("userId").notNull(),
  position: int("position").default(0).notNull(),
  addedAt: timestamp("addedAt").defaultNow().notNull(),
});

export type CollectionItem = typeof collectionItems.$inferSelect;
export type InsertCollectionItem = typeof collectionItems.$inferInsert;

// ── Research Tasks ──────────────────────────────────────────────
export const researchTasks = mysqlTable("research_tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  taskPrompt: text("taskPrompt").notNull(),
  provider: varchar("provider", { length: 64 }),
  model: varchar("model", { length: 128 }),
  agentCount: int("agentCount").default(5),
  status: mysqlEnum("status", ["pending", "running", "complete", "error", "cancelled"]).default("pending").notNull(),
  reportUrl: text("reportUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type ResearchTask = typeof researchTasks.$inferSelect;

// ── Safety Evaluations ──────────────────────────────────────────
export const safetyEvaluations = mysqlTable("safety_evaluations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  verdict: varchar("verdict", { length: 32 }),
  severity: varchar("severity", { length: 32 }),
  reasoning: text("reasoning"),
  policy: varchar("policy", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SafetyEvaluation = typeof safetyEvaluations.$inferSelect;

// ── Saved Prompts ───────────────────────────────────────────────
export const savedPrompts = mysqlTable("saved_prompts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  category: varchar("category", { length: 64 }).notNull(), // image, video, tts, edit
  name: varchar("name", { length: 256 }).notNull(),
  prompt: text("prompt").notNull(),
  useCount: int("useCount").default(0).notNull(),
  isRewrite: int("isRewrite").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SavedPrompt = typeof savedPrompts.$inferSelect;
export type InsertSavedPrompt = typeof savedPrompts.$inferInsert;

// ── Export Presets ─────────────────────────────────────────────
export const exportPresets = mysqlTable("export_presets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  feature: varchar("feature", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  settings: json("settings").notNull(),
  isDefault: int("isDefault").default(0).notNull(),
  useCount: int("useCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExportPreset = typeof exportPresets.$inferSelect;
export type InsertExportPreset = typeof exportPresets.$inferInsert;

// ── Usage Log ───────────────────────────────────────────────────
export const usageLog = mysqlTable("usage_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  feature: varchar("feature", { length: 64 }).notNull(), // image_gen, video_gen, tts, image_edit, compare
  model: varchar("model", { length: 128 }),
  promptTokens: int("promptTokens"),
  completionTokens: int("completionTokens"),
  itemCount: int("itemCount").default(1),
  success: int("success").default(1).notNull(),
  errorMessage: text("errorMessage"),
  durationMs: int("durationMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UsageLogEntry = typeof usageLog.$inferSelect;

// ── Rewrite Rules (Auto-Retry Learning) ─────────────────────────
export const rewriteRules = mysqlTable("rewrite_rules", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  category: varchar("category", { length: 64 }).notNull(),
  originalPrompt: text("originalPrompt").notNull(),
  rewrittenPrompt: text("rewrittenPrompt").notNull(),
  attempts: int("attempts").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RewriteRule = typeof rewriteRules.$inferSelect;
export type InsertRewriteRule = typeof rewriteRules.$inferInsert;

// ── Favorites ───────────────────────────────────────────────────
// References cached_content by ID (replaces artifacts.isFavorite flag).
export const favorites = mysqlTable("favorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  cachedContentId: int("cachedContentId").notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Favorite = typeof favorites.$inferSelect;
export type InsertFavorite = typeof favorites.$inferInsert;

// ── Share Links ─────────────────────────────────────────────────
// Public token-based access to gallery items.
export const shareLinks = mysqlTable("share_links", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  cachedContentId: int("cachedContentId").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  /** Optional: allow before/after showcase opt-in */
  isShowcase: int("isShowcase").default(0).notNull(),
  viewCount: int("viewCount").default(0).notNull(),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ShareLink = typeof shareLinks.$inferSelect;
export type InsertShareLink = typeof shareLinks.$inferInsert;
