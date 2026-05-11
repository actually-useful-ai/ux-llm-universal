# Project TODO

## Canonical `/io/chat` now live

- [x] Add utility routes for voice, favorites, templates, presets, models, analytics, tokenizer, batches, research tools, showcase, and share pages
- [x] Add public share/showcase endpoints
- [x] Add presets persistence to `ux-glm-chat`
- [x] Add direct gallery/favorites collection linking
- [x] Add direct gallery/favorites share actions

## Next build work

- [ ] Apply presets directly inside image, video, and TTS generation panels
- [ ] Add `/research/search` route for Studio portal parity
- [ ] Add `/research/hive` route for Studio workflow parity
- [ ] Port video edit/extend workflows from the legacy media app
- [ ] Replace lightweight share tokens with dedicated persisted share-link records
- [ ] Decide whether showcase should stay favorite-driven or become explicitly opt-in

## Cleanup and verification

- [ ] Fix baseline `pnpm run check` failures in `JobContext.tsx`
- [ ] Fix baseline `pnpm run check` failures in `emoji-replace.tsx`
- [ ] Fix baseline `pnpm run check` failures in `tool-service.ts`
- [ ] Resolve external `dreamer-proxy.ts` typecheck failure without clobbering model-list work
- [ ] Repoint or retire legacy `/io/images`, `/io/vision`, `/io/voice`, `/io/media`, and `/io/studio` once parity is confirmed
