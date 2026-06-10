# Post-Merge Build Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out every remaining `todo.md` + `.nextup.json` build item in ux-llm-universal after the media merge: clean typecheck baseline, persisted share links, preset application in generation panels, Veo 3.1 video generation, plus small parity/cosmetic fixes.

**Architecture:** All work happens inside this one React 19 + Express + tRPC + Drizzle monorepo. Server changes live in `server/dreamer-proxy.ts` (model registry + provider branches) and `server/public-artifact-proxy.ts` (public share route); client changes are per-page/per-panel with one new shared component (`PresetPicker`). Each task is independently committable and gated on `pnpm check` (clean after Task 1) + `pnpm test` + `pnpm build`. Deploy once at the end (`pnpm build && sm restart geepers-chat`).

**Tech Stack:** TypeScript, React 19 + wouter + shadcn/ui + @trpc/react-query, Express, Drizzle ORM (MySQL), vitest, esbuild/Vite, Gemini API (Veo 3.1).

**Recon provenance (2026-06-10):** three Explore agents + direct reads. Key facts: tsconfig has no `target` (5 of 10 baseline errors are downlevel artifacts); presets router fully operational but no panel reads it; gallery share mints stateless `art_*` tokens while `shareLinks` table + sharing router sit unused by that button; Studio has NO research/search/hive surfaces (those todos are unfulfillable as written); VideoEditPage is at donor parity except ComparisonSlider isn't wired; no Veo path exists (only xai + openai video branches).

---

### Task 1: Clean the `pnpm check` baseline (10 errors → 0)

**Files:**
- Modify: `tsconfig.json` (add `target`)
- Modify: `client/src/lib/emoji-replace.tsx:71,81` (duplicate keys)
- Modify: `client/src/lib/tool-service.ts:16-20` (type shape)
- Modify: `server/dreamer-proxy.ts:1037` (cast)

- [ ] **Step 1: Record the failing baseline**

Run: `pnpm check 2>&1 | grep -c "error TS"`
Expected: `10`

- [ ] **Step 2: Add ES2022 target to tsconfig.json**

tsc is `noEmit` here (Vite/esbuild do all emit), so `target` only affects checking. In `compilerOptions` add:

```json
    "target": "ES2022",
```

Kills: JobContext.tsx TS2802, emoji-replace TS1501 ×3 + TS2802.

- [ ] **Step 3: Remove duplicate emoji keys**

`'🌐'` is defined at line 49 AND 71; `'📺'` at line 31 AND 81. Keep the first occurrences; edit the later lines:

```tsx
// line 71: '🔗': Globe, '🌐': Globe,   →
  '🔗': Globe,
// line 81: '📺': Youtube, '🎥': Film,  →
  '🎥': Film,
```

(`'📺'` stays `Film` from line 31; if Youtube is preferred, change line 31 instead — pick ONE definition site.)

- [ ] **Step 4: Tighten ToolInfo parameter type**

In `client/src/lib/tool-service.ts` replace lines 16-20:

```ts
  parameters: {
    type: string;
    required?: string[];
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  };
```

This matches `OllamaTool['function']['parameters']` so line 159 assigns cleanly.

- [ ] **Step 5: Fix the ReadableStream cast**

`server/dreamer-proxy.ts:1037`:

```ts
            for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
```

- [ ] **Step 6: Verify clean check + tests + build**

Run: `pnpm check` → exit 0, zero errors. Run: `pnpm test` → pass. Run: `pnpm build` → success.

- [ ] **Step 7: Update CLAUDE.md baseline section**

Replace the "Baseline `pnpm check` failures" section body with: baseline is now CLEAN; treat any `pnpm check` error as a regression.

- [ ] **Step 8: Commit**

```bash
git add tsconfig.json client/src/lib/emoji-replace.tsx client/src/lib/tool-service.ts server/dreamer-proxy.ts
git commit -m "fix: zero out the pnpm check baseline (ES2022 target + 4 real type bugs)"
```

---

### Task 2: Rename package to ux-llm-universal

**Files:**
- Modify: `package.json:2`

- [ ] **Step 1: Edit name field**

```json
  "name": "ux-llm-universal",
```

Do NOT touch the `ollama-chat-settings` / `ollama-chat-data` localStorage keys in SettingsContext/ConversationContext — renaming those would wipe every user's saved settings/conversations.

- [ ] **Step 2: Verify build identity unaffected**

Run: `pnpm build` → success; `node -e "console.log(require('./package.json').name)"` → `ux-llm-universal`. start.sh runs `node dist/index.js` directly (no name dependency).

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: rename package ollama-chat -> ux-llm-universal (localStorage keys untouched)"
```

---

### Task 3: Wire ComparisonSlider into VideoEditPage (last donor-parity gap)

**Files:**
- Modify: `client/src/pages/VideoEditPage.tsx` (import + comparison modal ~lines 472-497)
- Reference: `client/src/components/ComparisonSlider.tsx` (exists, unused)

- [ ] **Step 1: Read the donor usage**

Read `/home/coolhand/projects/_archive-ux-llm-media/client/src/pages/VideoEditPage.tsx` lines ~460-495 (ComparisonSlider usage) and `client/src/components/ComparisonSlider.tsx` (props contract) before editing.

- [ ] **Step 2: Replace the grid comparison with the slider**

Add `import { ComparisonSlider } from "@/components/ComparisonSlider";` and swap the two-`<video>` grid inside the comparison modal for the donor's `<ComparisonSlider before={...} after={...} />` markup (copy the donor's prop wiring, adjusting only the tRPC path names `xai.*` → `xaiGen.*` if any appear).

- [ ] **Step 3: Verify**

Run: `pnpm check` → clean. Run: `pnpm build` → success.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/VideoEditPage.tsx
git commit -m "feat(video-edit): drag-to-compare slider in the comparison modal (donor parity)"
```

---

### Task 4: Persisted share links everywhere (retire stateless art_* minting)

The sharing tRPC router + `shareLinks` table already exist and power Showcase. The gallery share button still mints stateless `art_*` tokens (no view counts, no expiry, no DB record). Make the public share route resolve BOTH token kinds (old links keep working), and switch creation to persisted records. Showcase opt-in is already the data model (`isShowcase`); expose it as an explicit gallery action — this also resolves the todo "decide whether showcase should stay favorite-driven or become explicitly opt-in" (it became opt-in at Stage 5b; this adds the UI).

**Files:**
- Modify: `server/public-artifact-proxy.ts` (dual-token resolution)
- Test: `server/public-artifact-proxy.test.ts` (new — token classifier)
- Modify: `client/src/pages/GalleryPage.tsx:42-47` + card action row (~line 235)
- Reference: `server/routers/sharing.ts` (create/view procedures), `drizzle/schema.ts:180-193` (shareLinks)

- [ ] **Step 1: Write the failing test for token classification**

```ts
// server/public-artifact-proxy.test.ts
import { describe, expect, it } from 'vitest';
import { decodeLegacyToken } from './public-artifact-proxy';

describe('decodeLegacyToken', () => {
  it('decodes art_<base36> tokens to a content id', () => {
    expect(decodeLegacyToken('art_2u')).toBe(102);
  });
  it('returns null for persisted (non-art) tokens', () => {
    expect(decodeLegacyToken('Kx9fL2mQ7vR4tY8wZ1aB3cD6eF0gH5jN')).toBeNull();
  });
  it('returns null for malformed art tokens', () => {
    expect(decodeLegacyToken('art_!!!')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `pnpm vitest run server/public-artifact-proxy.test.ts`
Expected: FAIL — `decodeLegacyToken` is not exported (it's private `decodeToken`).

- [ ] **Step 3: Implement dual resolution in public-artifact-proxy.ts**

Rename `decodeToken` → exported `decodeLegacyToken`. In the `/api/share/:token` handler, branch:

```ts
import { eq, sql } from 'drizzle-orm';
import { cachedContent, shareLinks } from '../drizzle/schema';

// inside the handler, before the legacy path:
const legacyId = decodeLegacyToken(req.params.token);
if (legacyId === null) {
  // Persisted share-link token
  const linkRows = await db.select().from(shareLinks)
    .where(eq(shareLinks.token, req.params.token)).limit(1);
  const link = linkRows[0];
  if (!link) return res.status(404).json({ error: 'Shared artifact not found' });
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
    return res.status(410).json({ error: 'Share link expired' });
  }
  const contentRows = await db.select().from(cachedContent)
    .where(eq(cachedContent.id, link.cachedContentId)).limit(1);
  const content = contentRows[0];
  if (!content) return res.status(404).json({ error: 'Shared artifact not found' });
  void db.update(shareLinks)
    .set({ viewCount: sql`${shareLinks.viewCount} + 1` })
    .where(eq(shareLinks.id, link.id))
    .catch(() => {});
  return res.json({
    token: link.token,
    viewCount: (link.viewCount ?? 0) + 1,
    sharedAt: link.createdAt,
    isShowcase: !!link.isShowcase,
    content: toShareContent(content),
  });
}
// ...existing legacy art_* path unchanged below...
```

(Adjust column names to the actual drizzle schema at lines 180-193 when editing.)

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run server/public-artifact-proxy.test.ts` → PASS. Run: `pnpm test` → all pass.

- [ ] **Step 5: Switch GalleryPage to persisted creation + showcase opt-in**

Replace `copyShareLink` (lines 42-47):

```tsx
const createShare = trpc.sharing.create.useMutation();

const copyShareLink = async (serverId?: number, showcase = false) => {
  if (!serverId) return;
  const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`;
  try {
    const { token } = await createShare.mutateAsync({
      cachedContentId: serverId,
      isShowcase: showcase,
    });
    await navigator.clipboard.writeText(`${base}/share/${token}`);
    toast.success(showcase ? 'Added to showcase — link copied' : 'Share link copied');
  } catch {
    // Unauthenticated/offline fallback: legacy stateless link still resolves server-side
    await navigator.clipboard.writeText(`${base}${artifactSharePath(serverId)}`);
    toast.success('Share link copied');
  }
};
```

Match the existing trpc client import pattern used elsewhere in the page/app (`trpc` from `@/lib/trpc` or equivalent — check ShowcasePage.tsx:40). Add an "Add to showcase" action next to the existing share button on the artifact card (~line 235) calling `copyShareLink(artifact.serverId, true)` — reuse the card's existing icon-button markup with a `Star`/`Globe` lucide icon and an aria-label.

- [ ] **Step 6: Verify + smoke**

`pnpm check` clean; `pnpm test` pass; `pnpm build` success. Dev smoke: share an artifact, open the copied `/share/<token>` URL, confirm view count increments on reload and the old `art_*` URL format still renders.

- [ ] **Step 7: Commit**

```bash
git add server/public-artifact-proxy.ts server/public-artifact-proxy.test.ts client/src/pages/GalleryPage.tsx
git commit -m "feat(share): persisted share links from gallery + dual-token public route + showcase opt-in"
```

---

### Task 5: Apply presets inside the generation panels

Presets CRUD exists (`exportPresets` table, `server/routers/presets.ts`: list/save/update/delete/use; PresetsPage manages them). Panels never read them. Add one shared `PresetPicker` and wire it into the three panels. Settings payloads are opaque JSON — each panel maps known keys to its own state and ignores the rest.

**Files:**
- Create: `client/src/components/PresetPicker.tsx`
- Modify: `client/src/components/ImageGenPanel.tsx` (state at ~98-130, header row)
- Modify: `client/src/components/VideoGenPanel.tsx` (state at ~47-80, header row)
- Modify: `client/src/components/TTSPanel.tsx` (state at ~70-110, header row)

- [ ] **Step 1: Create PresetPicker**

```tsx
// client/src/components/PresetPicker.tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save } from 'lucide-react';

type Feature = 'image_gen' | 'image_edit' | 'video_gen' | 'video_edit' | 'tts';

interface PresetPickerProps {
  feature: Feature;
  getCurrentSettings: () => Record<string, unknown>;
  onApply: (settings: Record<string, unknown>) => void;
}

export function PresetPicker({ feature, getCurrentSettings, onApply }: PresetPickerProps) {
  const utils = trpc.useUtils();
  const { data: presets } = trpc.presets.list.useQuery({ feature });
  const savePreset = trpc.presets.save.useMutation({
    onSuccess: () => utils.presets.list.invalidate({ feature }),
  });
  const usePreset = trpc.presets.use.useMutation();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  const apply = (idStr: string) => {
    const preset = presets?.find(p => String(p.id) === idStr);
    if (!preset) return;
    onApply((preset.settings ?? {}) as Record<string, unknown>);
    usePreset.mutate({ id: preset.id });
    toast.success(`Preset "${preset.name}" applied`);
  };

  const saveCurrent = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await savePreset.mutateAsync({ feature, name: trimmed, settings: getCurrentSettings() });
    toast.success(`Preset "${trimmed}" saved`);
    setName('');
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Select onValueChange={apply}>
        <SelectTrigger className="h-8 w-44" aria-label="Apply preset">
          <SelectValue placeholder={presets?.length ? 'Apply preset…' : 'No presets yet'} />
        </SelectTrigger>
        <SelectContent>
          {(presets ?? []).map(p => (
            <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {saving ? (
        <form
          className="flex items-center gap-1"
          onSubmit={e => { e.preventDefault(); void saveCurrent(); }}
        >
          <Input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Preset name"
            className="h-8 w-36"
            aria-label="New preset name"
          />
          <Button type="submit" size="sm" className="h-8" disabled={!name.trim() || savePreset.isPending}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setSaving(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <Button
          type="button" size="sm" variant="outline" className="h-8"
          onClick={() => setSaving(true)} aria-label="Save current settings as preset"
        >
          <Save className="w-3.5 h-3.5 mr-1" /> Save preset
        </Button>
      )}
    </div>
  );
}
```

Verify import paths against the repo's actual conventions (trpc client export name, sonner vs use-toast, ui paths) — match what the panels themselves already import.

- [ ] **Step 2: Wire into ImageGenPanel**

State keys (recon, lines 98-130): `selectedProvider, selectedModel, quantity, size, quality, seed, xaiAspectRatio, xaiResolution, openaiStyle, geminiAspectRatio, geminiNegativePrompt`. Add inside the component:

```tsx
const getCurrentSettings = () => ({
  provider: selectedProvider, model: selectedModel, quantity, size, quality, seed,
  xaiAspectRatio, xaiResolution, openaiStyle, geminiAspectRatio, geminiNegativePrompt,
});

const applyPreset = (s: Record<string, unknown>) => {
  if (typeof s.provider === 'string') setSelectedProvider(s.provider);
  if (typeof s.model === 'string') setSelectedModel(s.model);
  if (typeof s.quantity === 'number') setQuantity(s.quantity);
  if (typeof s.size === 'string') setSize(s.size);
  if (typeof s.quality === 'string') setQuality(s.quality);
  if (typeof s.seed === 'number' || typeof s.seed === 'string') setSeed(s.seed as never);
  if (typeof s.xaiAspectRatio === 'string') setXaiAspectRatio(s.xaiAspectRatio);
  if (typeof s.xaiResolution === 'string') setXaiResolution(s.xaiResolution);
  if (typeof s.openaiStyle === 'string') setOpenaiStyle(s.openaiStyle);
  if (typeof s.geminiAspectRatio === 'string') setGeminiAspectRatio(s.geminiAspectRatio);
  if (typeof s.geminiNegativePrompt === 'string') setGeminiNegativePrompt(s.geminiNegativePrompt);
};
```

Render `<PresetPicker feature="image_gen" getCurrentSettings={getCurrentSettings} onApply={applyPreset} />` in the panel's settings/header row (next to provider/model selectors). Match exact setter names from the file when editing — names above are from recon; never apply a preset's `model` without its `provider` (apply provider first; the panel's existing model-validity effect handles mismatches).

- [ ] **Step 3: Wire into VideoGenPanel**

Same pattern, `feature="video_gen"`, keys: `provider, model, duration, resolution, aspectRatio, soraSize, soraDuration, quantity` mapped to the panel's setters with the same typeof guards.

- [ ] **Step 4: Wire into TTSPanel**

Same pattern, `feature="tts"`, keys: `provider, voice, model, speed, codec, sampleRate, language` (voice → `setSelectedVoice`).

- [ ] **Step 5: Verify**

`pnpm check` clean; `pnpm build` success. Dev smoke (`pnpm dev`): save a preset from ImageGenPanel, reload, apply it, confirm fields repopulate; confirm it appears on PresetsPage with useCount incremented after apply.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/PresetPicker.tsx client/src/components/ImageGenPanel.tsx client/src/components/VideoGenPanel.tsx client/src/components/TTSPanel.tsx
git commit -m "feat(presets): apply + save presets directly in image/video/TTS generation panels"
```

---

### Task 6: Veo 3.1 video generation via Gemini (sora-2 sunsets 2026-09-24)

No google/gemini video path exists. Add one: registry entries, capability flag, generate branch, status-poll branch. Provider gated on `GEMINI_API_KEY` (already in env.ts:12).

**Files:**
- Modify: `server/dreamer-proxy.ts` — `PROVIDER_CAPABILITIES` (~line 60-72), `VIDEO_GEN_MODELS`/`VIDEO_GEN_DEFAULTS` (136-144), `/api/video/generate` (~1303-1374), video status poll (~1378-1512)

- [ ] **Step 1: Verify current Veo REST shape against live docs**

Use context7 (`/websites/ai_google_dev` or `googleapis/js-genai`) to confirm, for `veo-3.1-generate-001` on the Generative Language API v1beta: the `:predictLongRunning` request body (`instances[].prompt`, `parameters.{aspectRatio,negativePrompt,resolution,durationSeconds}`), the operation-polling endpoint, the completed-response path to the video URI, and how the file bytes are fetched (URI requires `key` param or `x-goog-api-key` header). Do NOT trust the sketch below over the docs.

- [ ] **Step 2: Registry + capability entries**

```ts
// VIDEO_GEN_MODELS — add:
  gemini: ['veo-3.1-generate-001', 'veo-3.1-fast-generate-001'],
// VIDEO_GEN_DEFAULTS — add:
  gemini: 'veo-3.1-generate-001',
// PROVIDER_CAPABILITIES.gemini — add 'video_generation'
```

Keep `openai: 'sora-2'` as openai's own default (its UI note already tracks the sunset); gemini becomes an available — and for Veo-capable keys, preferred — provider in the picker.

- [ ] **Step 3: Generate branch (after the openai branch, ~line 1343)**

```ts
} else if (provider === 'gemini') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'GEMINI_API_KEY not configured' });
  const body: Record<string, unknown> = {
    instances: [{ prompt }],
    parameters: {
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(negativePrompt ? { negativePrompt } : {}),
      ...(resolution ? { resolution } : {}),
    },
  };
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    }
  );
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data?.error?.message || 'Veo request failed' });
  // operation name is the request id we poll with
  return res.json({ requestId: data.name, status: 'pending', provider });
}
```

(Field names per Step 1 docs; mirror how the xai/openai branches read `prompt`/`model`/options from `req.body` and shape their responses — keep the response contract identical so VideoGenPanel polling works unchanged.)

- [ ] **Step 4: Status-poll branch (mirroring the openai poller ~1378-1512)**

Poll `GET https://generativelanguage.googleapis.com/v1beta/{operationName}` with the same header. While `done` is falsy → return the same "pending/in_progress" shape the client expects. On `done` with error → failed shape. On success: extract the video URI from the documented response path, download the bytes server-side (API key header), persist through the same local-disk helper the openai branch uses for durable `/generated/*` URLs, return the completed shape with the local URL. Note: the poll route must branch on provider the same way generate does — check how the client passes provider to the status endpoint and follow it.

- [ ] **Step 5: Verify**

`pnpm check` clean; `pnpm test` pass; `pnpm build` success. Live smoke only if `GEMINI_API_KEY` is configured in prod env: generate a short Veo clip end-to-end from VideoGenPanel after deploy (Task 7) — confirm pending → completed → playable `/generated/*` URL. If the key lacks Veo access, the branch must surface Google's error message verbatim (no silent failure).

- [ ] **Step 6: Commit**

```bash
git add server/dreamer-proxy.ts
git commit -m "feat(video): Veo 3.1 generation via Gemini (sora-2 sunsets 2026-09-24)"
```

---

### Task 7: Housekeeping, deploy, smoke

**Files:**
- Modify: `todo.md`, `.nextup.json`
- Deploy: `pnpm build && sm restart geepers-chat`

- [ ] **Step 1: Rewrite todo.md to match reality**

Mark done: presets-in-panels, share-link persistence, showcase decision (resolved: explicit opt-in via shareLinks, decided at Stage 5b + UI added in Task 4), video edit/extend port (was already at parity; slider wired), all four baseline-check items.
Drop with a note: `/research/search` + `/research/hive` "Studio parity" — recon 2026-06-10 confirmed ux-studio has no search or hive surfaces; nothing to port. If a research-search surface is wanted, it's a new feature, not parity.
Keep (Luke, Caddy is deny-ruled for Claude): repoint/retire legacy `/io/images`, `/io/vision`, `/io/voice`, `/io/studio` routes.

- [ ] **Step 2: Update .nextup.json**

Move the completed items (sora-2→Veo, baseline, package rename) into `done_recent` with `at: 2026-06-10`; add one new low-priority item: "xAI STT: STT currently routes monolithically through the Dreamer gateway (`/v1/voice/transcribe`); per-provider STT branching belongs in the gateway, not this app — wire grok STT there first, then add the `stt` capability + STT_MODELS.xai entry here." Re-aggregate via the nextup skill if its instructions call for it.

- [ ] **Step 3: Git safety, then deploy**

```bash
git log --oneline -3 && git status --short   # no surprise commits/files
pnpm build
sm restart geepers-chat
```

- [ ] **Step 4: Smoke production**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3460/health        # 200
curl -s -o /dev/null -w "%{http_code}\n" https://dr.eamer.dev/io/chat/       # 200
```

Browser smoke at `dr.eamer.dev/io/chat/`: Converse streams; Create → image gen works; gallery share copies a persisted token URL that renders; a preset round-trips in ImageGenPanel; VideoEditPage comparison slider drags.

- [ ] **Step 5: Push**

```bash
git push && git log origin/main -1 --oneline
```

---

## Self-review notes

- **Spec coverage:** todo.md items → Tasks 4 (share, showcase), 5 (presets), 3 (video edit parity), 1 (4 baseline files incl. dreamer-proxy), 7 (research-route drop + legacy-route handoff to Luke). .nextup.json items → 6 (Veo), 1 (baseline), 2 (rename); xAI STT explicitly re-scoped to the gateway in Task 7; illustrator fold intentionally left as the standing low-priority .nextup item (kept standalone — out of scope here).
- **Known unknowns flagged in-plan:** exact Veo v1beta field names (Task 6 Step 1 verifies against docs before coding); exact setter names in the three panels and the trpc client import path (verify-on-edit noted in Tasks 4-5); ComparisonSlider props copied from donor (Task 3 Step 1 reads first).
- **Type consistency:** `decodeLegacyToken` (Task 4 test + impl match); `PresetPicker` props (`feature/getCurrentSettings/onApply`) used identically across Tasks 5 Steps 2-4.
