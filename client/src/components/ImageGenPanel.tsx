// ============================================================
// ImageGenPanel — Full-featured image generation
// Multi-provider, batch gen, size/quality/style, auto-retry,
// download individual/all/ZIP, send-to-edit
// Adapted from imagine-studio ImageGenPage for unified workspace
// ============================================================

import { useState, useMemo, useRef, useCallback } from 'react';
import {
  Image as ImageIcon, Loader2, Sparkles, AlertTriangle, Download,
  Star, Trash2, StopCircle, Archive, Pencil, Shuffle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useProviders } from '@/contexts/ProviderContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useJobs, type ImageJob } from '@/contexts/JobContext';
import { useArtifacts } from '@/contexts/ArtifactContext';
import { apiUrl } from '@/lib/api-base';
import { MediaViewer, type MediaItem } from '@/components/MediaViewer';
import { PresetPicker } from '@/components/PresetPicker';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ── Size / quality / style options ────────────────────────────────

const XAI_ASPECT_RATIOS = [
  { value: '1:1', label: '1:1 (Square)' },
  { value: '16:9', label: '16:9 (Wide)' },
  { value: '9:16', label: '9:16 (Tall)' },
  { value: '4:3', label: '4:3 (Landscape)' },
  { value: '3:4', label: '3:4 (Portrait)' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '2:1', label: '2:1 (Ultra Wide)' },
  { value: 'auto', label: 'Auto' },
];

const XAI_RESOLUTIONS = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
];

// gpt-image-1 sizes
const GPT_IMAGE_SIZES = [
  { value: '1024x1024', label: '1024x1024 (Square)' },
  { value: '1024x1536', label: '1024x1536 (Portrait)' },
  { value: '1536x1024', label: '1536x1024 (Landscape)' },
  { value: 'auto', label: 'Auto' },
];

// dall-e-3 sizes
const DALLE3_SIZES = [
  { value: '1024x1024', label: '1024x1024 (Square)' },
  { value: '1792x1024', label: '1792x1024 (Landscape)' },
  { value: '1024x1792', label: '1024x1792 (Portrait)' },
];

const GEMINI_ASPECT_RATIOS = [
  { value: '1:1', label: '1:1 (Square)' },
  { value: '3:4', label: '3:4 (Portrait)' },
  { value: '4:3', label: '4:3 (Landscape)' },
  { value: '9:16', label: '9:16 (Tall)' },
  { value: '16:9', label: '16:9 (Wide)' },
];

// gpt-image-1 quality
const GPT_IMAGE_QUALITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

// dall-e-3 quality
const DALLE3_QUALITIES = [
  { value: 'standard', label: 'Standard' },
  { value: 'hd', label: 'HD' },
];

// ── Types ─────────────────────────────────────────────────────────

interface GeneratedImage {
  url: string;
  prompt: string;
  provider: string;
  model: string;
  revisedPrompt?: string;
  wasRewritten?: boolean;
  originalPrompt?: string;
  finalPrompt?: string;
  totalAttempts?: number;
  timestamp: number;
}

export default function ImageGenPanel() {
  const { themeName } = useTheme();
  const { providers } = useProviders();
  const { addJob, updateJob } = useJobs();
  const { saveArtifact } = useArtifacts();

  // Core state
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const abortRef = useRef(false);

  // Generation settings
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState('1024x1024');
  const [quality, setQuality] = useState('medium');
  const [batchStatus, setBatchStatus] = useState<{ done: number; total: number } | null>(null);

  // xAI-specific
  const [xaiAspectRatio, setXaiAspectRatio] = useState('1:1');
  const [xaiResolution, setXaiResolution] = useState('1k');

  // OpenAI-specific
  const [openaiStyle, setOpenaiStyle] = useState<'vivid' | 'natural'>('vivid');

  // Gemini-specific
  const [geminiAspectRatio, setGeminiAspectRatio] = useState('1:1');
  const [geminiNegativePrompt, setGeminiNegativePrompt] = useState('');

  // Seed (cross-provider, optional)
  const [seed, setSeed] = useState<string>('');
  const randomizeSeed = () => setSeed(String(Math.floor(Math.random() * 2147483647)));

  // Filter to providers that have image_generation capability
  const imageProviders = useMemo(
    () => providers.filter((p: any) => p.capabilities?.includes('image_generation') && p.imageGenModels?.length),
    [providers],
  );

  const [selectedProvider, setSelectedProvider] = useState<string>(() =>
    imageProviders[0]?.id || '',
  );
  const currentProvider = imageProviders.find((p: any) => p.id === selectedProvider) || imageProviders[0];

  const [selectedModel, setSelectedModel] = useState<string>(() =>
    (currentProvider as any)?.imageGenDefault || (currentProvider as any)?.imageGenModels?.[0] || '',
  );

  const handleProviderChange = (id: string) => {
    setSelectedProvider(id);
    const p = imageProviders.find((pr: any) => pr.id === id);
    setSelectedModel((p as any)?.imageGenDefault || (p as any)?.imageGenModels?.[0] || '');
    setSize('auto');
    setQuality('auto');
  };

  // ── Presets ─────────────────────────────────────────────────────
  const getCurrentSettings = () => ({
    provider: selectedProvider, model: selectedModel, quantity, size, quality, seed,
    xaiAspectRatio, xaiResolution, openaiStyle, geminiAspectRatio, geminiNegativePrompt,
  });

  // Provider first (it resets model/size/quality), then explicit keys override.
  const applyPreset = (s: Record<string, unknown>) => {
    if (typeof s.provider === 'string' && imageProviders.some((p: any) => p.id === s.provider)) {
      handleProviderChange(s.provider);
    }
    if (typeof s.model === 'string') setSelectedModel(s.model);
    if (typeof s.quantity === 'number') setQuantity(s.quantity);
    if (typeof s.size === 'string') setSize(s.size);
    if (typeof s.quality === 'string') setQuality(s.quality);
    if (typeof s.seed === 'string') setSeed(s.seed);
    if (typeof s.xaiAspectRatio === 'string') setXaiAspectRatio(s.xaiAspectRatio);
    if (typeof s.xaiResolution === 'string') setXaiResolution(s.xaiResolution);
    if (s.openaiStyle === 'vivid' || s.openaiStyle === 'natural') setOpenaiStyle(s.openaiStyle);
    if (typeof s.geminiAspectRatio === 'string') setGeminiAspectRatio(s.geminiAspectRatio);
    if (typeof s.geminiNegativePrompt === 'string') setGeminiNegativePrompt(s.geminiNegativePrompt);
  };

  // ── Generation logic ────────────────────────────────────────────

  const runGeneration = useCallback(async () => {
    if (!prompt.trim() || !selectedProvider || !selectedModel) return;
    const p = prompt.trim();
    abortRef.current = false;
    setGenerating(true);
    setError(null);

    const total = quantity;
    let done = 0;
    let remaining = total;
    let batchIndex = 0;
    let consecutiveFailures = 0;
    let successCount = 0;

    setBatchStatus(total > 1 ? { done: 0, total } : null);

    while (remaining > 0 && !abortRef.current) {
      const batchSize = Math.min(remaining, 4);

      // Build request body with provider-specific params
      const body: Record<string, unknown> = {
        prompt: p,
        provider: selectedProvider,
        model: selectedModel,
      };

      if (selectedProvider === 'xai') {
        body.aspect_ratio = xaiAspectRatio;
        body.quality = xaiResolution; // server maps to resolution
        body.n = batchSize;
      } else if (selectedProvider === 'openai') {
        const isGptImage1 = selectedModel.startsWith('gpt-image-1');
        body.size = size !== 'auto' ? size : '1024x1024';
        body.quality = quality;
        if (!isGptImage1) body.style = openaiStyle;
        body.n = batchSize;
      } else if (selectedProvider === 'huggingface') {
        body.n = batchSize;
      }

      // For Gemini, include aspect ratio
      if (selectedProvider === 'gemini') {
        body.aspect_ratio = geminiAspectRatio;
        if (geminiNegativePrompt) body.negative_prompt = geminiNegativePrompt;
        body.n = batchSize;
      }

      // Seed — supported by most providers
      if (seed) body.seed = Number(seed);

      const jobId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      try {
        const res = await fetch(apiUrl('/api/image/generate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(data.error || `Generation failed (${res.status})`);
        }

        const data = await res.json();
        const urls: string[] = data.images || (data.url ? [data.url] : []);
        consecutiveFailures = 0;

        for (const url of urls) {
          const newImg: GeneratedImage = {
            url,
            prompt: p,
            provider: selectedProvider,
            model: selectedModel,
            revisedPrompt: data.revised_prompt,
            timestamp: Date.now(),
          };
          setGeneratedImages(prev => [newImg, ...prev]);

          // Track in JobContext
          addJob({
            id: `${jobId}-${successCount}`,
            type: 'image',
            status: 'done',
            prompt: p,
            provider: selectedProvider,
            model: selectedModel,
            startedAt: Date.now(),
            completedAt: Date.now(),
            url,
          } as ImageJob);

          // Save to artifacts for gallery persistence
          saveArtifact({
            type: 'image',
            url,
            prompt: p,
            provider: selectedProvider,
            model: selectedModel,
            metadata: {
              revisedPrompt: data.revised_prompt,
              size: size !== 'auto' ? size : undefined,
              quality: quality !== 'auto' ? quality : undefined,
            },
          });

          successCount++;
        }

        done += urls.length || batchSize;
      } catch (err) {
        consecutiveFailures++;
        const msg = err instanceof Error ? err.message : 'Generation failed';
        const truncated = msg.length > 200 ? msg.slice(0, 200) + '...' : msg;
        toast.error(`Batch ${batchIndex + 1}: ${truncated}`);
        done += batchSize;

        if (consecutiveFailures >= 2 && remaining > batchSize) {
          toast.error('Stopping batch: prompt appears consistently rejected.');
          break;
        }
      }

      remaining -= batchSize;
      batchIndex++;
      if (total > 1) setBatchStatus({ done: Math.min(done, total), total });

      // Small delay between batches
      if (remaining > 0 && !abortRef.current) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    setGenerating(false);
    setBatchStatus(null);
    if (successCount > 0 && !abortRef.current) {
      toast.success(`Generated ${successCount} image${successCount > 1 ? 's' : ''}`);
      setPrompt('');
    } else if (successCount === 0 && !abortRef.current) {
      setError('No images were generated. The prompt may have been rejected.');
    }
  }, [prompt, quantity, size, quality, selectedProvider, selectedModel, openaiStyle, xaiAspectRatio, xaiResolution, geminiAspectRatio, geminiNegativePrompt, addJob, saveArtifact]);

  // ── Downloads ───────────────────────────────────────────────────

  const handleDownload = (url: string, index: number) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `image-${Date.now()}-${index}.png`;
    a.click();
  };

  const handleClearAll = () => {
    abortRef.current = true;
    setGeneratedImages([]);
    setGenerating(false);
    setBatchStatus(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !generating) {
      e.preventDefault();
      runGeneration();
    }
  };

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  // MediaViewer items
  const mediaItems: MediaItem[] = generatedImages.map(img => ({
    type: 'image' as const,
    url: img.url,
    prompt: img.prompt,
    metadata: { provider: img.provider, model: img.model, revisedPrompt: img.revisedPrompt },
  }));

  const noProviders = imageProviders.length === 0;
  const isXAI = selectedProvider === 'xai';
  const isOpenAI = selectedProvider === 'openai';
  const isGemini = selectedProvider === 'gemini';

  return (
    <div className="flex-1 flex flex-col lg:flex-row min-w-0">
      {/* ── Settings Panel (left side on desktop, top on mobile) ──── */}
      <div className="lg:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-border/30 bg-background/50 lg:overflow-y-auto">
        <div className="p-3 space-y-3">
          <PresetPicker feature="image_gen" getCurrentSettings={getCurrentSettings} onApply={applyPreset} />

          {/* Provider + model */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Provider</label>
            <Select value={selectedProvider} onValueChange={handleProviderChange}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                {imageProviders.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Model</label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                {((currentProvider as any)?.imageGenModels || []).map((m: string) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity + Size + Quality */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Qty</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={quantity}
                onChange={e => setQuantity(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                onFocus={e => e.target.select()}
                className="h-8 text-xs"
              />
            </div>

            {/* xAI: aspect ratio + resolution */}
            {isXAI && (
              <>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Ratio</label>
                  <Select value={xaiAspectRatio} onValueChange={setXaiAspectRatio}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {XAI_ASPECT_RATIOS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Res</label>
                  <Select value={xaiResolution} onValueChange={setXaiResolution}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {XAI_RESOLUTIONS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* OpenAI: size + quality (model-aware) */}
            {isOpenAI && (
              <>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Size</label>
                  <Select value={size} onValueChange={setSize}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(selectedModel.startsWith('gpt-image-1') ? GPT_IMAGE_SIZES : DALLE3_SIZES).map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Quality</label>
                  <Select value={quality} onValueChange={setQuality}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(selectedModel.startsWith('gpt-image-1') ? GPT_IMAGE_QUALITIES : DALLE3_QUALITIES).map(q => (
                        <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Gemini: aspect ratio */}
            {isGemini && (
              <div className="col-span-2 space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Aspect Ratio</label>
                <Select value={geminiAspectRatio} onValueChange={setGeminiAspectRatio}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GEMINI_ASPECT_RATIOS.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* OpenAI dall-e-3: style */}
          {isOpenAI && selectedModel === 'dall-e-3' && (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Style</label>
              <Select value={openaiStyle} onValueChange={v => setOpenaiStyle(v as 'vivid' | 'natural')}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vivid">Vivid</SelectItem>
                  <SelectItem value="natural">Natural</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Gemini: negative prompt */}
          {isGemini && (
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Negative Prompt</label>
              <Input
                value={geminiNegativePrompt}
                onChange={e => setGeminiNegativePrompt(e.target.value)}
                placeholder="What to exclude..."
                className="h-8 text-xs"
              />
            </div>
          )}

          {quantity > 4 && (
            <p className="text-[10px] text-amber-500/70">
              Generates in batches of 4 with unique seeds. Each image appears immediately.
            </p>
          )}

          {/* Prompt */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Prompt</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the image you want to generate..."
              rows={3}
              className="w-full resize-none border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all rounded-lg"
            />
            <p className="text-[10px] text-muted-foreground/40">Ctrl+Enter to generate</p>
          </div>

          {/* Seed */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Seed (optional)</label>
            <div className="flex items-center gap-1.5">
              <Input
                value={seed}
                onChange={e => setSeed(e.target.value.replace(/\D/g, ''))}
                placeholder="Random"
                className="h-8 text-xs tabular-nums flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0 shrink-0"
                onClick={randomizeSeed}
                title="Random seed"
              >
                <Shuffle className="w-3.5 h-3.5" />
              </Button>
              {seed && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={() => setSeed('')}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* Generate button */}
          <Button
            onClick={runGeneration}
            disabled={!prompt.trim() || generating || noProviders}
            className="w-full h-9 text-sm"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating {batchStatus ? `${batchStatus.done}/${batchStatus.total}` : '...'}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate {quantity > 1 ? `${quantity} Images` : 'Image'}
              </>
            )}
          </Button>

          {/* Stop button */}
          {generating && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-7 gap-1"
              onClick={() => { abortRef.current = true; }}
            >
              <StopCircle className="h-3 w-3" /> Stop
            </Button>
          )}

          {/* Batch progress */}
          {batchStatus && (
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Progress</span>
                <span>{batchStatus.done}/{batchStatus.total}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${(batchStatus.done / batchStatus.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions bar when images exist */}
          {generatedImages.length > 0 && (
            <div className="flex items-center gap-1 pt-1 border-t border-border/30">
              <span className="text-[10px] text-muted-foreground/50 mr-auto">{generatedImages.length} images</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-1.5 gap-1 text-destructive hover:text-destructive"
                onClick={handleClearAll}
              >
                <Trash2 className="h-3 w-3" /> Clear
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Results Grid (right side) ──────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto chat-scroll">
        {noProviders ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-4">
            <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center',
              themeName === 'nebula' ? 'bg-indigo-900/20' : themeName === 'slate' ? 'bg-teal-900/20' : 'bg-amber-900/20',
            )}>
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="text-center">
              <p className="eyebrow mb-2">NO IMAGE PROVIDERS</p>
              <p className="text-sm">Add an API key for OpenAI (DALL-E), xAI (Grok), or HuggingFace (Flux/SDXL) in your server .env</p>
            </div>
          </div>
        ) : generatedImages.length === 0 && !generating ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-4">
            <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center',
              themeName === 'nebula' ? 'bg-indigo-900/20' : themeName === 'slate' ? 'bg-teal-900/20' : 'bg-amber-900/20',
            )}>
              <ImageIcon className="w-8 h-8" />
            </div>
            <div className="text-center">
              <p className="eyebrow mb-2">IMAGE GENERATION</p>
              <p className="text-sm">Generated images will appear here</p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                Each image appears the moment it's ready
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3 p-2 sm:p-4">
            {/* Loading placeholders */}
            {generating && batchStatus && Array.from({ length: Math.max(0, Math.min(4, batchStatus.total - batchStatus.done)) }).map((_, i) => (
              <div key={`loading-${i}`} className="rounded-xl border bg-card aspect-square flex items-center justify-center animate-pulse">
                <Loader2 className="h-6 w-6 animate-spin text-primary/30" />
              </div>
            ))}

            {/* Generated images */}
            <AnimatePresence>
              {generatedImages.map((img, i) => (
                <motion.div
                  key={`${img.url}-${i}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="group relative rounded-xl overflow-hidden border border-border bg-card cursor-pointer"
                  onClick={() => openViewer(i)}
                >
                  <img
                    src={img.url}
                    alt={img.revisedPrompt || img.prompt}
                    className="w-full aspect-square object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
                    <div className="flex-1 mr-1">
                      {img.wasRewritten && (
                        <span className="inline-block px-1.5 py-0.5 text-[9px] rounded bg-amber-500/80 text-white mb-1">
                          Rewritten ({img.totalAttempts} attempts)
                        </span>
                      )}
                      {img.revisedPrompt && (
                        <p className="text-white text-[10px] line-clamp-2">{img.revisedPrompt}</p>
                      )}
                      {!img.revisedPrompt && (
                        <p className="text-white text-[10px] line-clamp-2">{img.prompt}</p>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5" onClick={e => e.stopPropagation()}>
                      <button
                        className="h-7 w-7 flex items-center justify-center rounded-lg bg-black/50 hover:bg-black/70 text-white transition-colors"
                        onClick={() => handleDownload(img.url, i)}
                        title="Download"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* MediaViewer */}
      <MediaViewer
        items={mediaItems}
        initialIndex={viewerIndex}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-2 bg-destructive/10 border-t border-destructive/20"
          >
            <p className="text-sm text-destructive text-center max-w-3xl mx-auto">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
