# Project TODO

## Done (2026-06-10 post-merge build pass)

- [x] Apply presets directly inside image, video, and TTS generation panels (shared PresetPicker)
- [x] Replace lightweight share tokens with persisted share-link records (gallery/favorites mint
      share_links rows; /api/share/:token resolves both formats so old art_* links keep working)
- [x] Showcase decision: explicitly opt-in (data model settled at Stage 5b; gallery now has an
      add-to-showcase action)
- [x] Port video edit/extend workflows — verified already at donor parity 2026-06-10; the donor's
      ComparisonSlider import in VideoEditPage was vestigial (it's an image slider, used by
      ImageEditPage + ShowcasePage in both apps)
- [x] Fix the `pnpm run check` baseline (JobContext, emoji-replace, tool-service, dreamer-proxy) —
      clean as of 2026-06-10; also repaired the ollama-proxy test suite (SSRF guard opt-in)
- [x] Veo 3.1 video generation via gemini provider (sora-2 sunset hedge)

## Dropped

- ~~Add `/research/search` and `/research/hive` routes for Studio parity~~ — recon 2026-06-10:
  ux-studio has no search or hive surfaces; there is nothing to port. A research-search surface
  would be a new feature; propose separately if wanted.

## Remaining

- [ ] (Luke — Caddy edits are deny-ruled for Claude) Repoint or retire legacy `/io/images`,
      `/io/vision`, `/io/voice`, `/io/studio` routes now that parity is confirmed
