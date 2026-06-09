-- Stage 5b of the universal merge: drop the legacy content tables now that the
-- artifacts/collections routers and the public share proxy read and write the
-- unified cached_content store (+ favorites join + collection_items).
--
-- Prerequisites (verified before running):
--   * Stage 3 copied all 43 legacy `artifacts` rows into `cached_content`
--     (cached_content now holds 607 rows; favorites holds 2; collection_items 0)
--   * The artifacts/collections tRPC routers and public-artifact-proxy no longer
--     reference these tables
--   * Fresh backup taken to /tmp/ux_glm_chat_pre_stage5b.sql
--
-- collection_artifacts is dropped first (it has a FK-like dependency on
-- artifacts in the relations graph, though no DB-level FK exists).

DROP TABLE IF EXISTS `collection_artifacts`;
DROP TABLE IF EXISTS `artifacts`;
