# ux-llm-universal Merge Blueprint

Merging ux-glm-chat (base, port 3460, /io/chat) + ux-llm-media (donor, port 5066, /io/media)
into one universal app. Produced 2026-06-09 from a full read of both repos. Companion doc:
`docs/canonical-io-chat.md` (the original consolidation intent).

## Conventions

- `glm` = `/home/coolhand/projects/ux-glm-chat` (the BASE — universal evolves in place here)
- `media` = `/home/coolhand/projects/ux-llm-media` (the donor)
- Both live until Stage 6 cutover. Production deploy is glm built in place; `servers/geepers-chat`
  is a symlink to the glm dir; sm key `geepers-chat`.

## Section 1: Target Architecture

### Mode / route map

| Mode | Client Route | Description | Source |
|------|-------------|-------------|--------|
| Converse | `/` | Multi-provider streaming chat, tool calling | glm `ConversePage.tsx` |
| Create | `/create` | Image/Video/TTS generation + editing tabs, auto-retry, batch | glm `CreatePage.tsx` + media generation pages |
| Voice | `/voice` | Realtime voice + TTS, STT | glm `VoicePage.tsx` |
| Evaluate | `/evaluate` | Safety / content evaluation | glm `EvaluatePage.tsx` |
| Research | `/research` | Research tools catalog | glm `ResearchToolsPage.tsx` |
| Gallery | `/gallery` | All generated content grid | glm `GalleryPage.tsx` (expanded) |
| Collections | `/collections` | Named folders over gallery | glm page, media schema |
| Favorites | `/favorites` | Starred items | glm page, media join-table model |
| Share | `/share/:token` | Public share view | unified |
| Showcase | `/showcase` | Public opt-in gallery | richer of the two versions |
| Rewrites | `/rewrites` | Auto-retry rewrite history | media `RewriteHistoryPage.tsx` |
| Presets / Analytics / Batches / Templates / Models / Tokenizer | as today | | glm |
| API Key | `/api-key` | User-supplied key entry | media `ApiKeyPage.tsx` |
| Compare | `/compare` | Side-by-side comparison | media `ComparisonPage.tsx` |

`/io/chat/*` base path stays (Caddy handle_path → 3460). Create mode absorbs /io/media.

### Server layout

**dreamer-proxy.ts remains the single generation hub.** Additions to `server/_core/index.ts`:
- `registerDownloadProxy(app)` — SSRF-guarded download proxy lifted from media
- `registerXaiChatStream(app)` — media's `POST /api/xai/chat/stream` SSE endpoint (standalone file)
- Media tRPC routers added to `server/routers.ts`: cache, autoRetry, batch, favorites, sharing,
  xai-generation (register as `xaiGen`, NOT `xai` — see Section 4)

Stays unchanged: ollama-proxy, manus-proxy, safeguard-proxy, xai-utility-proxy,
public-artifact-proxy (extended for shareLinks tokens).

New files: `server/download-proxy.ts`, `server/_core/ssrf-guard.ts` (verbatim from media),
`server/xai-api.ts` (extracted non-chat functions from media's xai.ts: generateImage, editImage,
generateVideo, textToSpeech — needed by batch + autoRetry routers).

### Unified schema (glm base + media shapes)

| Table | Origin | Action |
|-------|--------|--------|
| `users` | identical | keep |
| `artifacts` → `cachedContent` | glm → media shape | rename + transform (below) |
| `collection_artifacts` → `collectionItems` | glm → media shape | replace (adds position, userId) |
| `collections` | diverged | adopt media (adds coverImageUrl, itemCount, updatedAt) |
| `researchTasks`, `safetyEvaluations` | glm only | keep |
| `savedPrompts` | diverged | adopt media (adds isRewrite, updatedAt) |
| `exportPresets` | identical | keep |
| `usageLog` | near-identical | keep glm (nullable userId) |
| `rewriteRules` | diverged | add media's `attempts` col; keep varchar(64) category |
| `favorites` | media only | add (id, userId, cachedContentId, note, createdAt) |
| `shareLinks` | media only | add (token unique, isShowcase, viewCount, expiresAt) |

**artifacts → cachedContent column transforms:** `url`→`contentUrl` (nullable); `type` enum →
varchar(32); `metadata` text → native JSON; `provider` column absorbed into metadata JSON;
**drop `isFavorite` int** (becomes the favorites join table); add `title text`.

## Section 2: Migration Sequence (each stage independently verifiable)

### Stage 0 — Pre-flight (0.5h)
- Both apps `pnpm build` clean; both healthy in `sm status`
- MySQL backups: `mysqldump ux_glm_chat > /tmp/ux_glm_chat_pre_merge.sql`;
  `mysqldump ux_llm_media > /tmp/ux_llm_media_pre_merge.sql`
- Confirmed: same MySQL server (localhost:3306), different DBs — `ux_glm_chat` (glm .env:24),
  `ux_llm_media` (media .env:5). Cross-DB SQL works natively.
- Record git HEADs. Rollback: nothing.

### Stage 1 — Schema expansion in glm (TS only, no db:push) (1.5h)
`drizzle/schema.ts`: add `cachedContent` (new table; keep `artifacts` definition with a
`// LEGACY — remove after Stage 3` marker so artifactsRouter compiles); replace
collectionArtifacts with collectionItems; update collections/savedPrompts/rewriteRules columns;
add favorites + shareLinks; export new types. `drizzle/relations.ts`: add relations.
**Do NOT run `pnpm db:push`** — Stage 3 does explicit SQL first.
Verify: `pnpm check` no NEW errors vs the known 4-file baseline. Rollback: git revert.

### Stage 2 — Server-side port into glm (3h)
Create: `_core/ssrf-guard.ts`, `download-proxy.ts`, `xai-chat-stream.ts`, `xai-api.ts`,
`routers/{cache,favorites,sharing,batch,autoRetry}.ts` (lifted, imports adjusted:
autoRetry's `from "../xai"` → `from "../xai-api"`).
Modify: `server/db.ts` (merge media's query functions, lines 99-744 of media db.ts);
`server/routers.ts` (register new routers); `server/_core/index.ts` (register proxies + merged
rate limits: keep glm `generationThrottle` for Express proxy paths, add media's
`perIpRateLimit`/`concurrencyLimit`/`isTrpcGenerationPath` for the SSE chat stream, /api/download,
and tRPC generation procedures; add `/uploads` static); `server/rate-limit.ts` (add the 3 media
exports); `server/_core/env.ts` (add 4 provider key fields); `server/_core/context.ts` (take
media's version — adds getOrCreateLocalAdmin standalone posture; OAuth path unchanged).
Verify: `pnpm build` + tests pass; production untouched. Rollback: git revert.

### Stage 3 — Data migration, MySQL (1.5h incl. dry run)
**3a:** dry-run everything against `ux_universal_staging` (import of the backup) first.
**3b DDL on ux_glm_chat:** CREATE cached_content / collection_items / favorites / share_links;
ALTER saved_prompts (+isRewrite,+updatedAt), rewrite_rules (+attempts), collections
(+coverImageUrl,+itemCount,+updatedAt). (Full SQL in the blueprint history; regenerate from
schema.ts if needed.)
**3c:** INSERT cached_content FROM artifacts (url→contentUrl; enum CASE map, audio→tts;
provider merged into metadata JSON with legacy:true marker).
**3d:** artifacts.isFavorite=1 rows → favorites.
**3e:** collection_artifacts → collection_items (ROW_NUMBER position, userId from collections
join). MUST run before artifacts is dropped.
**3f:** media data in: users deduped by openId; cached_content re-inserted (new auto-inc IDs);
favorites/share_links remapped via contentUrl+userId join; rewrite_rules direct.
**3g:** UPDATE collections.itemCount. **3h:** row-count validation.
Rollback: restore /tmp backups.

### Stage 4 — Client-side port into glm (3h)
Create from media: ImageGenPage, ImageEditPage, VideoEditPage, RewriteHistoryPage, ApiKeyPage,
ComparisonPage; JobManager context; AutoRetryBadge, KeyboardShortcutsHelp components.
Reconcile: ShowcasePage (take richer), nav/AppLayout vs DashboardLayout/Sidebar.
Modify: router registration (add /images, /images/edit, /videos/edit, /rewrites, /api-key,
/compare), context providers. tRPC client needs no changes (new routers auto-callable).
AUDIT FIRST: ImageGenPanel/VideoGenPanel call sites — each UI action must use exactly ONE
path (tRPC mutation OR dreamer-proxy Express route), never both (double-billing risk).
Verify: pnpm dev renders all new pages, pnpm check no new errors. Rollback: revert client commits.

### Stage 5 — Build, smoke, deploy (1h)
pnpm build; sm restart geepers-chat; manual smoke (Converse, image gen, gallery, a migrated
share token). Then DROP artifacts + collection_artifacts; remove LEGACY schema definition;
`pnpm db:push` only to sync Drizzle's journal (no-op).
Verify: healthy at 3460; /io/media still up at 5066. Rollback: restore backup + old build.

### Stage 6 — Cutover (0.5h, Caddy/sm steps executed by Luke)
1. Verify universal serves everything at /io/chat
2. Caddy: `/io/media/*` → `redir ... 308` into /io/chat/create (308 preserves method).
   NOTE the Caddyfile redir-matcher pitfall: must be `redir * <to> 308` — a bare `redir /path 308`
   parses the path as a matcher and silently no-ops (endemic bug found 2026-06-09).
3. Media's `/uploads/*`: simplest is a Caddy static rule at the old uploads dir so migrated
   DB contentUrls keep resolving; retire later after URL audit.
4. `sm stop ux-llm-media`; remove its sm entry (then restart service-manager-monitor — the
   running monitor holds SERVICES in memory and will resurrect stopped services otherwise).
5. Repo: Option A (recommended) — `git remote set-url origin` to
   `actually-useful-ai/ux-llm-universal` (create empty repo first), push, then optionally
   `mv ux-glm-chat ux-llm-universal` (deploy unaffected if servers/geepers-chat symlink is
   updated to the new path at the same time — check start.sh cd target too).

## Section 3: DB migration key points
- Same MySQL server, cross-DB SQL fine. User dedup by openId. Media cached_content gets new
  auto-inc IDs; favorites/shareLinks remapped via contentUrl+userId (run the duplicate-URL
  pre-check; ambiguity expected ~0).
- Staging dry-run is mandatory before touching ux_glm_chat.
- db:push only AFTER manual DDL, as a journal sync.

## Section 4: What NOT to port from media
- `server/xai.ts` chat/models/embeddings functions (dreamer-proxy covers); extract ONLY the
  non-chat generation functions into xai-api.ts.
- `server/routers/xai.ts` chat/createResponse procedures (dual-path hazard); keep the
  generation procedures, registered as `xaiGen`.
- `server/{openai,gemini,runware}.ts` — dreamer-proxy covers; before dropping, check
  dreamer-proxy handles multipart image-edit; rescue only missing functions.
- `server/_core/systemRouter.ts` (keep glm's), `storage.ts` (keep glm's if storagePut signature
  matches — batchRouter depends on it), `OfflineQueue.tsx` (glm has it), client-side direct
  download logic (superseded by download proxy).

## Section 5: Risk register (top 5)
1. **contentUrl join ambiguity** in favorites/shareLinks remap (HIGH) — pre-check duplicates;
   userId guard in join.
2. **ID collision / stale references**: collection_artifacts→collection_items must complete
   before artifacts drops (MED) — sequenced in Stage 3.
3. **rate-limit merge drift** (LOW-MED) — media's env-tunable impl is the base for the 3 new
   exports; glm's generationThrottle untouched.
4. **Double-billing dual paths** tRPC vs dreamer-proxy (MED) — Stage 4 call-site audit;
   one path per UI action.
5. **Symlink/rename breakage** at Stage 6 (MED) — read start.sh + sm working_dir before renaming;
   update symlink atomically with the rename.

## Effort: ~11 hours total (S0 0.5 / S1 1.5 / S2 3 / S3 1.5 / S4 3 / S5 1 / S6 0.5)

## Key files to read before touching anything
glm: drizzle/schema.ts, server/dreamer-proxy.ts (registry lines 15-145), server/_core/index.ts,
server/routers.ts, server/rate-limit.ts, server/db.ts, server/_core/context.ts, CLAUDE.md.
media: drizzle/schema.ts, server/routers.ts (11 routers), server/_core/rate-limit.ts,
server/_core/ssrf-guard.ts, server/routers/autoRetry.ts, server/db.ts (lines 99-744), server/xai.ts.
