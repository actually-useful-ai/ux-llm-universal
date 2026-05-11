# Canonical `/io/chat` Migration Status

## Goal

`ux-glm-chat` is the canonical app for the `dr.eamer.dev/io/chat/*` surface. The migration goal is to absorb the user-facing functionality that previously lived across:

- `/io/images`
- `/io/vision`
- `/io/voice`
- `/io/media`
- `/io/studio`

## Implemented

These migration slices are already live in this repo:

- canonical utility routes:
  - `/voice`
  - `/favorites`
  - `/templates`
  - `/presets`
  - `/models`
  - `/analytics`
  - `/tokenizer`
  - `/batches`
  - `/research/tools`
  - `/showcase`
  - `/share/:token`
- public artifact endpoints:
  - `GET /api/share/:token`
  - `GET /api/showcase`
- xAI utility endpoints:
  - `POST /api/voice/realtime/session`
  - `POST /api/tokenize`
  - `/api/xai/batches/*`
- direct user workflows:
  - share from gallery
  - share from favorites
  - add to collections from gallery
  - add to collections from favorites
- presets persistence inside `ux-glm-chat`

## Current gaps

The app is broader now, but these parity gaps still matter:

1. Presets do not yet drive the actual create panels.
2. The Studio portal search and hive flows are not yet represented under `/research/*`.
3. The legacy media app still has richer video edit/extend workflows.
4. Live voice exists as a route and bootstrap path, but still needs deeper parity review against the old media experience.
5. Public sharing is currently pragmatic and lightweight:
   - share tokens are derived from existing artifact IDs
   - showcase is seeded from favorited artifacts
   - there is no dedicated persisted share-link model in this repo yet

## Recommended next order

1. Wire presets into `ImageGenPanel`, `VideoGenPanel`, and `TTSPanel`.
2. Add `/research/search` and `/research/hive` inside `ux-glm-chat`.
3. Port video edit/extend UI from the legacy media app.
4. Promote collections and sharing further inside the primary create/gallery flows.
5. Replace the lightweight share-token implementation with first-class share-link records.
6. Repoint or retire legacy `/io/*` surfaces after route-by-route parity confirmation.

## Verification note

The repo still has pre-existing TypeScript failures outside the migration slices:

- `client/src/contexts/JobContext.tsx`
- `client/src/lib/emoji-replace.tsx`
- `client/src/lib/tool-service.ts`
- `server/dreamer-proxy.ts`

Those should be cleaned up separately so `pnpm run check` can become a reliable gate again.
