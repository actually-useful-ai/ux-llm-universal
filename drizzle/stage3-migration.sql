-- ============================================================================
-- Stage 3 migration: unify content tables + import ux_llm_media data
-- Blueprint: docs/MERGE_BLUEPRINT.md Stage 3 (steps 3b-3g) + Section 3
-- Column definitions derived from the committed drizzle/schema.ts and verified
-- against the live drizzle-generated tables in ux_llm_media (SHOW CREATE TABLE).
--
-- USAGE (target database is the client's default DB; media source DB is
-- referenced as `ux_llm_media` by name):
--   staging:  mysql ... ux_universal_staging < drizzle/stage3-migration.sql
--   live:     mysql ... ux_glm_chat          < drizzle/stage3-migration.sql
--
-- Properties:
--   * Additive only. No DROP TABLE, no DROP COLUMN (drops happen in Stage 5).
--   * Idempotent-ish: CREATE TABLE IF NOT EXISTS; ADD COLUMN guarded via
--     information_schema (MySQL 8 has no ADD COLUMN IF NOT EXISTS); all DML
--     guarded with NOT EXISTS so re-runs insert nothing.
--   * glm artifacts keep their IDs in cached_content (explicit id insert);
--     media rows get new auto-increment IDs (blueprint Section 3).
-- ============================================================================

-- ── 3b. DDL: new tables ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `cached_content` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `type` varchar(32) NOT NULL,
  `title` text,
  `prompt` text,
  `contentUrl` text,
  `metadata` json DEFAULT NULL,
  `model` varchar(128) DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `collection_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `collectionId` int NOT NULL,
  `cachedContentId` int NOT NULL,
  `userId` int NOT NULL,
  `position` int NOT NULL DEFAULT '0',
  `addedAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `favorites` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `cachedContentId` int NOT NULL,
  `note` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `share_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `cachedContentId` int NOT NULL,
  `token` varchar(64) NOT NULL,
  `isShowcase` int NOT NULL DEFAULT '0',
  `viewCount` int NOT NULL DEFAULT '0',
  `expiresAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `share_links_token_unique` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ── 3b. DDL: column adds (information_schema-guarded; MySQL 8-safe) ─────────

-- saved_prompts: + isRewrite, + updatedAt
SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'saved_prompts' AND COLUMN_NAME = 'isRewrite') = 0,
  'ALTER TABLE `saved_prompts` ADD COLUMN `isRewrite` int NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'saved_prompts' AND COLUMN_NAME = 'updatedAt') = 0,
  'ALTER TABLE `saved_prompts` ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- rewrite_rules: + attempts (userId stays NULLABLE per Stage 1 deviation #3;
-- media rows are all non-null so inserts cannot conflict)
SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rewrite_rules' AND COLUMN_NAME = 'attempts') = 0,
  'ALTER TABLE `rewrite_rules` ADD COLUMN `attempts` int NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- collections: + coverImageUrl, + itemCount, + updatedAt
SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'collections' AND COLUMN_NAME = 'coverImageUrl') = 0,
  'ALTER TABLE `collections` ADD COLUMN `coverImageUrl` text', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'collections' AND COLUMN_NAME = 'itemCount') = 0,
  'ALTER TABLE `collections` ADD COLUMN `itemCount` int NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

SET @ddl := IF((SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'collections' AND COLUMN_NAME = 'updatedAt') = 0,
  'ALTER TABLE `collections` ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 3c. artifacts → cached_content (IDs preserved) ──────────────────────────
-- url→contentUrl; enum type CASE-mapped (audio→tts; image/video/document/report
-- pass through); provider column absorbed into metadata JSON alongside a
-- legacy:true marker and the old metadata text under rawMeta (parsed when the
-- old text is valid JSON, kept as a JSON string otherwise). title has no glm
-- source column → NULL.

INSERT INTO `cached_content`
  (`id`, `userId`, `type`, `title`, `prompt`, `contentUrl`, `metadata`, `model`, `createdAt`)
SELECT
  a.`id`,
  a.`userId`,
  CASE a.`type` WHEN 'audio' THEN 'tts' ELSE a.`type` END,
  NULL,
  a.`prompt`,
  a.`url`,
  JSON_OBJECT(
    'provider', a.`provider`,
    'legacy', TRUE,
    'rawMeta', CASE
      WHEN a.`metadata` IS NULL THEN NULL
      WHEN JSON_VALID(a.`metadata`) THEN CAST(a.`metadata` AS JSON)
      ELSE CAST(JSON_QUOTE(a.`metadata`) AS JSON)
    END
  ),
  a.`model`,
  a.`createdAt`
FROM `artifacts` a
WHERE NOT EXISTS (SELECT 1 FROM `cached_content` c WHERE c.`id` = a.`id`);

-- ── 3d. artifacts.isFavorite = 1 → favorites ────────────────────────────────

INSERT INTO `favorites` (`userId`, `cachedContentId`, `createdAt`)
SELECT a.`userId`, a.`id`, a.`createdAt`
FROM `artifacts` a
WHERE a.`isFavorite` = 1
  AND NOT EXISTS (
    SELECT 1 FROM `favorites` f
    WHERE f.`userId` = a.`userId` AND f.`cachedContentId` = a.`id`
  );

-- ── 3e. collection_artifacts → collection_items ─────────────────────────────
-- position = 0-based ROW_NUMBER within each collection, ordered by junction id
-- (insertion order). userId pulled from the owning collection. addedAt has no
-- source column → table default (now()).

INSERT INTO `collection_items` (`collectionId`, `cachedContentId`, `userId`, `position`)
SELECT t.`collectionId`, t.`artifactId`, t.`userId`, t.`pos`
FROM (
  SELECT
    ca.`collectionId`,
    ca.`artifactId`,
    col.`userId`,
    ROW_NUMBER() OVER (PARTITION BY ca.`collectionId` ORDER BY ca.`id`) - 1 AS pos
  FROM `collection_artifacts` ca
  JOIN `collections` col ON col.`id` = ca.`collectionId`
) t
WHERE NOT EXISTS (
  SELECT 1 FROM `collection_items` ci
  WHERE ci.`collectionId` = t.`collectionId` AND ci.`cachedContentId` = t.`artifactId`
);

-- ── 3f. Import ux_llm_media data ─────────────────────────────────────────────

-- 3f-i. users deduped by openId (media IDs NOT preserved; remapped below)
INSERT INTO `users`
  (`openId`, `name`, `email`, `loginMethod`, `role`, `createdAt`, `updatedAt`, `lastSignedIn`)
SELECT mu.`openId`, mu.`name`, mu.`email`, mu.`loginMethod`, mu.`role`,
       mu.`createdAt`, mu.`updatedAt`, mu.`lastSignedIn`
FROM `ux_llm_media`.`users` mu
WHERE NOT EXISTS (SELECT 1 FROM `users` u WHERE u.`openId` = mu.`openId`);

-- 3f-ii. media cached_content re-inserted with NEW auto-increment IDs,
-- userId remapped via openId. Re-run guard: a row with the same remapped
-- userId + type + createdAt + contentUrl + title is treated as already
-- imported (verified unique against current media data: the only duplicate
-- contentUrl group is 3 NULL-url chat rows with distinct createdAt).
INSERT INTO `cached_content`
  (`userId`, `type`, `title`, `prompt`, `contentUrl`, `metadata`, `model`, `createdAt`)
SELECT u.`id`, mc.`type`, mc.`title`, mc.`prompt`, mc.`contentUrl`, mc.`metadata`,
       mc.`model`, mc.`createdAt`
FROM `ux_llm_media`.`cached_content` mc
JOIN `ux_llm_media`.`users` mu ON mu.`id` = mc.`userId`
JOIN `users` u ON u.`openId` = mu.`openId`
WHERE NOT EXISTS (
  SELECT 1 FROM `cached_content` c
  WHERE c.`userId` = u.`id`
    AND c.`type` = mc.`type`
    AND c.`createdAt` = mc.`createdAt`
    AND c.`contentUrl` <=> mc.`contentUrl`
    AND c.`title` <=> mc.`title`
);

-- 3f-iii. media favorites remapped onto the new cached_content IDs via the
-- contentUrl + userId join (blueprint Section 3 / Risk 1). NULL contentUrls
-- are excluded from the join by design (plain =) — such rows surface in the
-- unmatched-remap validation query instead of guessing. MIN(id) is a
-- deterministic tiebreak if a duplicate URL ever appears for the same user.
INSERT INTO `favorites` (`userId`, `cachedContentId`, `note`, `createdAt`)
SELECT t.`uid`, t.`target`, t.`note`, t.`createdAt`
FROM (
  SELECT mf.`id` AS mfid, u.`id` AS uid, MIN(gc.`id`) AS target,
         mf.`note` AS note, mf.`createdAt` AS createdAt
  FROM `ux_llm_media`.`favorites` mf
  JOIN `ux_llm_media`.`cached_content` mc ON mc.`id` = mf.`cachedContentId`
  JOIN `ux_llm_media`.`users` mu ON mu.`id` = mf.`userId`
  JOIN `users` u ON u.`openId` = mu.`openId`
  JOIN `cached_content` gc
    ON gc.`userId` = u.`id` AND gc.`contentUrl` = mc.`contentUrl`
  GROUP BY mf.`id`, u.`id`, mf.`note`, mf.`createdAt`
) t
WHERE NOT EXISTS (
  SELECT 1 FROM `favorites` f
  WHERE f.`userId` = t.`uid` AND f.`cachedContentId` = t.`target`
);

-- 3f-iv. media share_links remapped the same way; token UNIQUE is the natural
-- idempotency key. (0 rows in media as of 2026-06-09; kept for completeness.)
INSERT INTO `share_links`
  (`userId`, `cachedContentId`, `token`, `isShowcase`, `viewCount`, `expiresAt`, `createdAt`)
SELECT t.`uid`, t.`target`, t.`token`, t.`isShowcase`, t.`viewCount`, t.`expiresAt`, t.`createdAt`
FROM (
  SELECT ms.`id` AS msid, u.`id` AS uid, MIN(gc.`id`) AS target,
         ms.`token` AS token, ms.`isShowcase` AS isShowcase, ms.`viewCount` AS viewCount,
         ms.`expiresAt` AS expiresAt, ms.`createdAt` AS createdAt
  FROM `ux_llm_media`.`share_links` ms
  JOIN `ux_llm_media`.`cached_content` mc ON mc.`id` = ms.`cachedContentId`
  JOIN `ux_llm_media`.`users` mu ON mu.`id` = ms.`userId`
  JOIN `users` u ON u.`openId` = mu.`openId`
  JOIN `cached_content` gc
    ON gc.`userId` = u.`id` AND gc.`contentUrl` = mc.`contentUrl`
  GROUP BY ms.`id`, u.`id`, ms.`token`, ms.`isShowcase`, ms.`viewCount`, ms.`expiresAt`, ms.`createdAt`
) t
WHERE NOT EXISTS (SELECT 1 FROM `share_links` s WHERE s.`token` = t.`token`);

-- 3f-v. media rewrite_rules direct copy (userId remapped via openId; media
-- category varchar(32) fits glm varchar(64); target userId stays nullable).
INSERT INTO `rewrite_rules`
  (`userId`, `category`, `originalPrompt`, `rewrittenPrompt`, `attempts`, `createdAt`)
SELECT u.`id`, mr.`category`, mr.`originalPrompt`, mr.`rewrittenPrompt`, mr.`attempts`, mr.`createdAt`
FROM `ux_llm_media`.`rewrite_rules` mr
JOIN `ux_llm_media`.`users` mu ON mu.`id` = mr.`userId`
JOIN `users` u ON u.`openId` = mu.`openId`
WHERE NOT EXISTS (
  SELECT 1 FROM `rewrite_rules` r
  WHERE r.`userId` = u.`id`
    AND r.`category` = mr.`category`
    AND r.`createdAt` = mr.`createdAt`
    AND r.`originalPrompt` = mr.`originalPrompt`
);

-- ── 3g. Recompute collections.itemCount ─────────────────────────────────────

UPDATE `collections` c
SET c.`itemCount` = (
  SELECT COUNT(*) FROM `collection_items` ci WHERE ci.`collectionId` = c.`id`
);

-- ── End of Stage 3 migration ─────────────────────────────────────────────────
-- Validation queries (3h) live in the runbook; NOT executed by this script.
-- NOTE deliberately out of scope per blueprint 3f (flagged for Luke):
--   * ux_llm_media.saved_prompts (100 rows, all isRewrite=1) is NOT imported —
--     blueprint Stage 3f lists only users / cached_content / favorites /
--     share_links / rewrite_rules. Import later with the same openId-remap
--     pattern if those auto-rewrite prompts should survive cutover.
--   * ux_llm_media.usage_log and export_presets are empty (0 rows) — nothing
--     to migrate.
