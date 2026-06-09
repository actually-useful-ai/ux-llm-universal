import { relations } from "drizzle-orm";
import {
  users, artifacts, collections, collectionArtifacts,
  savedPrompts, usageLog, rewriteRules, researchTasks, safetyEvaluations,
  cachedContent, collectionItems, favorites, shareLinks,
} from "./schema";

// ── User Relations ──────────────────────────────────────────────
export const usersRelations = relations(users, ({ many }) => ({
  artifacts: many(artifacts),
  cachedContent: many(cachedContent),
  collections: many(collections),
  savedPrompts: many(savedPrompts),
  usageLog: many(usageLog),
  rewriteRules: many(rewriteRules),
  researchTasks: many(researchTasks),
  safetyEvaluations: many(safetyEvaluations),
  favorites: many(favorites),
  shareLinks: many(shareLinks),
}));

// ── Cached Content Relations ────────────────────────────────────
export const cachedContentRelations = relations(cachedContent, ({ one, many }) => ({
  user: one(users, { fields: [cachedContent.userId], references: [users.id] }),
  favorites: many(favorites),
  shareLinks: many(shareLinks),
  collectionLinks: many(collectionItems),
}));

// ── Artifact Relations ──────────────────────────────────────────
export const artifactsRelations = relations(artifacts, ({ one, many }) => ({
  user: one(users, { fields: [artifacts.userId], references: [users.id] }),
  collectionLinks: many(collectionArtifacts),
}));

// ── Collection Relations ────────────────────────────────────────
export const collectionsRelations = relations(collections, ({ one, many }) => ({
  user: one(users, { fields: [collections.userId], references: [users.id] }),
  items: many(collectionItems),
  legacyItems: many(collectionArtifacts),
}));

export const collectionItemsRelations = relations(collectionItems, ({ one }) => ({
  collection: one(collections, { fields: [collectionItems.collectionId], references: [collections.id] }),
  content: one(cachedContent, { fields: [collectionItems.cachedContentId], references: [cachedContent.id] }),
  user: one(users, { fields: [collectionItems.userId], references: [users.id] }),
}));

// LEGACY — remove after Stage 3 data migration
export const collectionArtifactsRelations = relations(collectionArtifacts, ({ one }) => ({
  collection: one(collections, { fields: [collectionArtifacts.collectionId], references: [collections.id] }),
  artifact: one(artifacts, { fields: [collectionArtifacts.artifactId], references: [artifacts.id] }),
}));

// ── Favorites Relations ─────────────────────────────────────────
export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
  content: one(cachedContent, { fields: [favorites.cachedContentId], references: [cachedContent.id] }),
}));

// ── Share Link Relations ────────────────────────────────────────
export const shareLinksRelations = relations(shareLinks, ({ one }) => ({
  user: one(users, { fields: [shareLinks.userId], references: [users.id] }),
  content: one(cachedContent, { fields: [shareLinks.cachedContentId], references: [cachedContent.id] }),
}));

// ── Saved Prompts Relations ─────────────────────────────────────
export const savedPromptsRelations = relations(savedPrompts, ({ one }) => ({
  user: one(users, { fields: [savedPrompts.userId], references: [users.id] }),
}));

// ── Usage Log Relations ─────────────────────────────────────────
export const usageLogRelations = relations(usageLog, ({ one }) => ({
  user: one(users, { fields: [usageLog.userId], references: [users.id] }),
}));

// ── Rewrite Rules Relations ─────────────────────────────────────
export const rewriteRulesRelations = relations(rewriteRules, ({ one }) => ({
  user: one(users, { fields: [rewriteRules.userId], references: [users.id] }),
}));

// ── Research Tasks Relations ────────────────────────────────────
export const researchTasksRelations = relations(researchTasks, ({ one }) => ({
  user: one(users, { fields: [researchTasks.userId], references: [users.id] }),
}));

// ── Safety Evaluations Relations ────────────────────────────────
export const safetyEvaluationsRelations = relations(safetyEvaluations, ({ one }) => ({
  user: one(users, { fields: [safetyEvaluations.userId], references: [users.id] }),
}));
