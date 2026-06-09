// ============================================================
// ImageGenPage — Grok Imagine studio (xAI-only, tRPC path)
// Ported from ux-llm-media in Stage 4 of the universal merge.
// Multi-provider generation lives on /create (dreamer-proxy);
// this surface keeps media's xAI-specific extras: per-image
// seeds, generation queue, auto-retry rewrites.
// ============================================================
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { downloadMedia, downloadAllMedia, downloadAsZip } from "@/lib/download";
import { Loader2, Image, Download, Sparkles, History, Trash2, Star, Settings2, StopCircle, Archive, Paintbrush, Dices, Lock, Unlock, Plus, ListOrdered, X, Play } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import ContentHistory from "@/components/ContentHistory";
import PromptLibrary from "@/components/PromptLibrary";
import { AutoRetryToggle, AutoRetryBadge } from "@/components/AutoRetryBadge";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { MediaViewer, type MediaItem } from "@/components/MediaViewer";
import { useJobs } from "@/contexts/JobContext";
import { usePromptChain } from "@/contexts/PromptChainContext";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useLocation } from "wouter";
import { ProviderBadge } from "@/components/ProviderSelector";

const IMAGE_SIZES = [
  { value: "auto", label: "Auto" },
  { value: "1024x1024", label: "1024×1024 (Square)" },
  { value: "1024x1536", label: "1024×1536 (Portrait)" },
  { value: "1536x1024", label: "1536×1024 (Landscape)" },
  { value: "768x768", label: "768×768" },
  { value: "768x1344", label: "768×1344 (Tall)" },
  { value: "1344x768", label: "1344×768 (Wide)" },
];

const IMAGE_QUALITIES = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

// xAI Grok Imagine model dropdown. (Multi-provider model catalogs from the
// media app stayed behind: OpenAI/Gemini/Runware generate via /create.)
const XAI_IMAGE_MODELS = [
  { value: "grok-imagine-image-quality", label: "Grok Imagine — Quality ($0.05/image)" },
  { value: "grok-imagine-image", label: "Grok Imagine — Basic ($0.02/image)" },
];

type XaiImageModel = "grok-imagine-image-quality" | "grok-imagine-image";

type GeneratedImage = {
  url: string;
  revised_prompt?: string;
  wasRewritten?: boolean;
  originalPrompt?: string;
  finalPrompt?: string;
  totalAttempts?: number;
  attempts?: Array<{ prompt: string; error?: string }>;
  cachedId?: number;
};

type QueuedGeneration = {
  id: string;
  prompt: string;
  quantity: number;
  size: string;
  quality: string;
  autoRetry: boolean;
  maxRetries: number;
  seedMode: "random" | "fixed";
  seedValue: number;
  uniqueSeedPerImage: boolean;
  xaiModel?: XaiImageModel;
};

export default function ImageGenPage() {
  const [prompt, setPrompt] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState("auto");
  const [quality, setQuality] = useState("auto");
  const [xaiModel, setXaiModel] = useState<XaiImageModel>("grok-imagine-image-quality");
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [autoRetry, setAutoRetry] = useState(true);
  const [maxRetries, setMaxRetries] = useState(3);
  const [generating, setGenerating] = useState(false);
  const [batchStatus, setBatchStatus] = useState<{ done: number; total: number } | null>(null);
  const abortRef = useRef(false);
  // Seed controls
  const [seedMode, setSeedMode] = useState<"random" | "fixed">("random");
  const [seedValue, setSeedValue] = useState(() => Math.floor(Math.random() * 2147483647));
  const [uniqueSeedPerImage, setUniqueSeedPerImage] = useState(true);

  // Queue state
  const [queue, setQueue] = useState<QueuedGeneration[]>([]);
  const [runningQueue, setRunningQueue] = useState(false);
  const [queueProgress, setQueueProgress] = useState<{ current: number; total: number } | null>(null);

  // MediaViewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const { addJob } = useJobs();
  const { chain } = usePromptChain();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const favToggle = trpc.favorites.toggle.useMutation({
    onSuccess: () => utils.favorites.ids.invalidate(),
  });

  const favIdsQuery = trpc.favorites.ids.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const favIds = new Set(favIdsQuery.data || []);

  const generateMutation = trpc.xaiGen.imageGenerate.useMutation();
  const autoRetryMutation = trpc.autoRetry.imageGenerate.useMutation();

  const runGeneration = useCallback(async (overrides?: QueuedGeneration) => {
    const cfg = overrides ?? {
      prompt, quantity, size, quality, autoRetry, maxRetries,
      seedMode, seedValue, uniqueSeedPerImage, xaiModel,
    } as Omit<QueuedGeneration, "id">;
    const p = (overrides?.prompt ?? prompt).trim();
    if (!p) return;
    abortRef.current = false;
    setGenerating(true);

    const total = cfg.quantity;
    let done = 0;
    setBatchStatus(total > 1 ? { done: 0, total } : null);

    let remaining = total;
    let consecutiveFailures = 0;
    let successCount = 0;

    // xAI generation path — each image gets its own seed for variety
    let imageIndex = 0;
    while (remaining > 0 && !abortRef.current) {
      const imageSeed = cfg.seedMode === "fixed"
        ? (cfg.uniqueSeedPerImage ? cfg.seedValue + imageIndex : cfg.seedValue)
        : Math.floor(Math.random() * 2147483647);

      try {
        const extraParams: Record<string, unknown> = {
          seed: imageSeed,
          model: cfg.xaiModel || "grok-imagine-image-quality",
        };
        if (cfg.size !== "auto") extraParams.size = cfg.size;
        if (cfg.quality !== "auto") extraParams.quality = cfg.quality;

        let data: any;
        if (cfg.autoRetry) {
          data = await autoRetryMutation.mutateAsync({
            prompt: p, n: 1, maxRetries: cfg.maxRetries, ...extraParams,
          });
        } else {
          data = await generateMutation.mutateAsync({
            prompt: p, n: 1, ...extraParams,
          });
        }

        if (data?.data) {
          consecutiveFailures = 0;
          for (const img of data.data) {
            const jobId = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const newImg: GeneratedImage = {
              url: img.url,
              revised_prompt: img.revised_prompt,
              cachedId: img.cachedId,
              wasRewritten: data.wasRewritten,
              originalPrompt: data.originalPrompt,
              finalPrompt: data.finalPrompt,
              totalAttempts: data.totalAttempts,
              attempts: data.attempts,
            };
            setImages((prev) => [newImg, ...prev]);

            addJob({
              id: jobId,
              type: "image",
              status: "done",
              prompt: data.finalPrompt || p,
              startedAt: Date.now(),
              completedAt: Date.now(),
              url: img.url,
              revised_prompt: img.revised_prompt,
            });

            successCount++;
          }
          done += data.data.length;
        } else {
          done += 1;
        }
      } catch (err: any) {
        consecutiveFailures++;
        const errMsg = err.message?.length > 200 ? err.message.slice(0, 200) + "..." : err.message;
        toast.error(`Image ${imageIndex + 1} failed: ${errMsg}`);
        done += 1;

        // Circuit breaker: stop after 2 consecutive failures
        if (consecutiveFailures >= 2 && remaining > 1) {
          toast.error("Stopping batch: prompt appears to be consistently rejected. Try a different prompt.");
          break;
        }
      }

      remaining -= 1;
      imageIndex++;
      if (total > 1) {
        setBatchStatus({ done: Math.min(done, total), total });
      }

      if (remaining > 0 && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setGenerating(false);
    setBatchStatus(null);
    if (successCount > 0 && !abortRef.current) {
      toast.success(`Generated ${successCount} image${successCount > 1 ? "s" : ""}`);
    } else if (successCount === 0 && !abortRef.current) {
      toast.error("No images were generated. The prompt may have been rejected.");
    }
  }, [prompt, quantity, autoRetry, maxRetries, size, quality, xaiModel, seedMode, seedValue, uniqueSeedPerImage, generateMutation, autoRetryMutation, addJob]);

  const addToQueue = useCallback(() => {
    if (!prompt.trim()) return;
    const item: QueuedGeneration = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      prompt: prompt.trim(),
      quantity,
      size,
      quality,
      autoRetry,
      maxRetries,
      seedMode,
      seedValue,
      uniqueSeedPerImage,
      xaiModel,
    };
    setQueue(prev => [...prev, item]);
    toast.success(`Added to queue: ${quantity}x grok imagine`);
  }, [prompt, quantity, size, quality, autoRetry, maxRetries, xaiModel, seedMode, seedValue, uniqueSeedPerImage]);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => prev.filter(q => q.id !== id));
  }, []);

  const runQueue = useCallback(async () => {
    if (queue.length === 0) return;
    setRunningQueue(true);
    const items = [...queue];
    setQueue([]);
    setQueueProgress({ current: 0, total: items.length });

    for (let i = 0; i < items.length; i++) {
      if (abortRef.current) break;
      setQueueProgress({ current: i + 1, total: items.length });
      toast.info(`Queue ${i + 1}/${items.length}: ${items[i].quantity}x images`);
      await runGeneration(items[i]);
    }

    setRunningQueue(false);
    setQueueProgress(null);
    if (!abortRef.current) toast.success("Queue complete!");
  }, [queue, runGeneration]);

  const handleDownload = async (url: string, index: number) => {
    try {
      await downloadMedia(url, `grok-image-${Date.now()}-${index}.png`);
    } catch {
      toast.error("Failed to download image");
    }
  };

  const handleDownloadAll = async () => {
    if (images.length === 0) return;
    toast.info(`Downloading ${images.length} images...`);
    await downloadAllMedia(
      images.map((img, i) => ({ url: img.url, filename: `grok-image-${Date.now()}-${i}.png` })),
      (done, total) => { if (done === total) toast.success("All images downloaded"); }
    );
  };

  const handleDownloadZip = async () => {
    if (images.length === 0) return;
    const toastId = toast.loading(`Preparing ZIP (0/${images.length})...`);
    try {
      await downloadAsZip(
        images.map((img, i) => ({ url: img.url, filename: `grok-image-${i + 1}.png` })),
        `grok-images-${Date.now()}.zip`,
        (done, total) => {
          if (done < total) {
            toast.loading(`Preparing ZIP (${done + 1}/${total})...`, { id: toastId });
          } else {
            toast.success(`ZIP ready with ${total} images`, { id: toastId });
          }
        }
      );
    } catch {
      toast.error("Failed to create ZIP", { id: toastId });
    }
  };

  // Build MediaViewer items from current images
  const mediaItems: MediaItem[] = images.map(img => ({
    type: "image" as const,
    url: img.url,
    title: img.revised_prompt || img.finalPrompt || "Generated image",
    prompt: img.originalPrompt || prompt,
    revisedPrompt: img.revised_prompt,
    cachedId: img.cachedId,
    metadata: {
      wasRewritten: img.wasRewritten,
      totalAttempts: img.totalAttempts,
    },
  }));

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      keys: "g",
      description: "Generate images",
      handler: () => { if (!generating && prompt.trim()) runGeneration(); },
      noInputFocus: true,
    },
    {
      keys: "ctrl+enter",
      description: "Generate images",
      handler: () => { if (!generating && prompt.trim()) runGeneration(); },
      noInputFocus: false,
    },
  ]);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto lg:overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b bg-background/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Image className="h-4 w-4 text-primary shrink-0" />
          <h1 className="font-semibold text-sm truncate">Image Generation</h1>
          <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">grok-imagine</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {images.length > 0 && (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={handleDownloadZip} title="Download all as ZIP">
                <Archive className="h-3 w-3" /> <span className="hidden sm:inline">ZIP ({images.length})</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={handleDownloadAll} title="Download individually">
                <Download className="h-3 w-3" /> <span className="hidden sm:inline">All</span>
              </Button>
              <Button
                variant="ghost" size="sm"
                className="h-7 text-xs gap-1 px-2 text-destructive hover:text-destructive"
                onClick={() => { abortRef.current = true; setImages([]); setGenerating(false); setBatchStatus(null); }}
              >
                <Trash2 className="h-3 w-3" /> <span className="hidden sm:inline">Clear</span>
              </Button>
            </>
          )}
          <KeyboardShortcutsHelp />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setHistoryOpen(true)}>
            <History className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Controls sidebar */}
        <div className="lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r bg-background/50 lg:overflow-y-auto">
          {/* Prompt — always visible */}
          <div className="p-3 space-y-3 border-b border-border/50">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-xs font-medium">Prompt</Label>
                <PromptLibrary category="image" currentPrompt={prompt} onSelectPrompt={setPrompt} />
              </div>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                className="h-20 lg:h-28 resize-none text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !generating) {
                    e.preventDefault();
                    runGeneration();
                  }
                }}
              />
            </div>

            <Button onClick={() => runGeneration()} disabled={!prompt.trim() || generating} className="w-full h-9 text-sm">
              {generating ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating {batchStatus ? `${batchStatus.done}/${batchStatus.total}` : "..."}</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Generate {quantity > 1 ? `${quantity} Images` : "Image"}</>
              )}
            </Button>

            {generating && (
              <Button variant="outline" size="sm" className="w-full text-xs h-7 gap-1" onClick={() => { abortRef.current = true; }}>
                <StopCircle className="h-3 w-3" /> Stop Generation
              </Button>
            )}

            {batchStatus && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Progress</span>
                  <span>{batchStatus.done}/{batchStatus.total}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(batchStatus.done / batchStatus.total) * 100}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Generation Settings — collapsible */}
          <CollapsiblePanel
            title="Generation Settings"
            icon={<Settings2 className="h-3.5 w-3.5 text-muted-foreground" />}
            defaultOpen={true}
            badge={<span className="text-[10px] text-muted-foreground">xAI</span>}
          >
            <div className="p-3 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-[11px] font-medium">Qty</Label>
                  <Input
                    type="number" min={1} max={100}
                    value={quantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") return;
                      setQuantity(Math.max(1, Math.min(100, parseInt(val) || 1)));
                    }}
                    onFocus={(e) => e.target.select()}
                    className="h-8 text-xs mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-medium">Size</Label>
                  <Select value={size} onValueChange={setSize}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {IMAGE_SIZES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px] font-medium">Quality</Label>
                  <Select value={quality} onValueChange={setQuality}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {IMAGE_QUALITIES.map(q => (
                        <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-[11px] font-medium">Model</Label>
                <Select value={xaiModel} onValueChange={(v) => setXaiModel(v as XaiImageModel)}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {XAI_IMAGE_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium">Auto-Retry</Label>
                <AutoRetryToggle enabled={autoRetry} onToggle={setAutoRetry} maxRetries={maxRetries} onMaxRetriesChange={setMaxRetries} />
              </div>
            </div>
          </CollapsiblePanel>

          {/* Seed Controls — collapsible */}
          <CollapsiblePanel
            title="Seed Control"
            icon={<Dices className="h-3.5 w-3.5 text-muted-foreground" />}
            defaultOpen={false}
            badge={<span className="text-[10px] text-muted-foreground font-mono">{seedMode === "fixed" ? `#${seedValue}` : "random"}</span>}
          >
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-medium">Mode</Label>
                <div className="flex items-center gap-1">
                  <Button
                    variant={seedMode === "fixed" ? "secondary" : "ghost"}
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setSeedMode(seedMode === "fixed" ? "random" : "fixed")}
                    title={seedMode === "fixed" ? "Seed locked — click to randomize" : "Seed random — click to lock"}
                  >
                    {seedMode === "fixed" ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3 text-muted-foreground" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setSeedValue(Math.floor(Math.random() * 2147483647))}
                    title="New random seed"
                  >
                    <Dices className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {seedMode === "fixed" && (
                <>
                  <Input
                    type="number"
                    value={seedValue}
                    onChange={(e) => setSeedValue(parseInt(e.target.value) || 0)}
                    onFocus={(e) => e.target.select()}
                    className="h-7 text-xs font-mono"
                    min={0}
                    max={2147483647}
                  />
                  {quantity > 1 && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                          uniqueSeedPerImage
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                        onClick={() => setUniqueSeedPerImage(true)}
                      >
                        Unique per image
                      </button>
                      <button
                        type="button"
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                          !uniqueSeedPerImage
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/30"
                        }`}
                        onClick={() => setUniqueSeedPerImage(false)}
                      >
                        Same for all
                      </button>
                    </div>
                  )}
                </>
              )}
              {seedMode === "random" && (
                <p className="text-[10px] text-muted-foreground">Unique random seed per image for maximum variety</p>
              )}
            </div>
          </CollapsiblePanel>

          {/* Generation Queue */}
          <CollapsiblePanel
            title="Queue"
            icon={<ListOrdered className="h-3.5 w-3.5 text-muted-foreground" />}
            defaultOpen={queue.length > 0}
            badge={queue.length > 0 ? <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">{queue.length}</span> : undefined}
          >
            <div className="p-3 space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs h-7 gap-1"
                onClick={addToQueue}
                disabled={!prompt.trim() || generating || runningQueue}
              >
                <Plus className="h-3 w-3" /> Add Current Settings to Queue
              </Button>

              {queue.length > 0 && (
                <>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {queue.map((item, i) => (
                      <div key={item.id} className="flex items-center gap-2 p-1.5 rounded border border-border/50 bg-muted/30">
                        <span className="text-[10px] font-medium text-muted-foreground w-4 shrink-0">{i + 1}</span>
                        <ProviderBadge provider="xai" />
                        <span className="text-[10px] truncate flex-1" title={item.prompt}>{item.prompt}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">×{item.quantity}</span>
                        <button onClick={() => removeFromQueue(item.id)} className="h-4 w-4 shrink-0 text-muted-foreground hover:text-destructive transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="flex-1 text-xs h-7 gap-1"
                      onClick={runQueue}
                      disabled={generating || runningQueue}
                    >
                      <Play className="h-3 w-3" /> Run Queue ({queue.reduce((sum, q) => sum + q.quantity, 0)} images)
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 px-2 text-destructive hover:text-destructive"
                      onClick={() => setQueue([])}
                      disabled={runningQueue}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  {queueProgress && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Queue</span>
                        <span>{queueProgress.current}/{queueProgress.total} groups</span>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${(queueProgress.current / queueProgress.total) * 100}%` }} />
                      </div>
                    </div>
                  )}
                </>
              )}

              {queue.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-1">Add groups to run multiple generations in sequence</p>
              )}
            </div>
          </CollapsiblePanel>
        </div>

        {/* Results grid */}
        <div className="flex-1 min-h-0">
          {images.length === 0 && !generating ? (
            <div className="flex h-full items-center justify-center text-muted-foreground p-4">
              <div className="text-center space-y-2">
                <Image className="h-12 w-12 mx-auto opacity-15" />
                <p className="text-sm">Generated images will appear here</p>
                <p className="text-[11px] text-zinc-600">Each image appears the moment it's ready</p>
                <p className="text-[10px] text-zinc-700">Cmd/Ctrl+Enter to generate</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3 p-2 sm:p-4">
                {generating && batchStatus && Array.from({ length: Math.max(0, Math.min(4, batchStatus.total - batchStatus.done)) }).map((_, i) => (
                  <div key={`loading-${i}`} className="rounded-lg border bg-card aspect-square flex items-center justify-center animate-pulse">
                    <Loader2 className="h-6 w-6 animate-spin text-primary/30" />
                  </div>
                ))}
                {images.map((img, i) => (
                  <div
                    key={`${img.url}-${i}`}
                    className="group relative rounded-lg overflow-hidden border bg-card cursor-pointer"
                    onClick={() => openViewer(i)}
                  >
                    <img
                      src={img.url}
                      alt={img.revised_prompt || "Generated image"}
                      className="w-full aspect-square object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
                      <div className="flex-1 mr-1 space-y-0.5">
                        {img.wasRewritten && (
                          <AutoRetryBadge
                            wasRewritten={true}
                            originalPrompt={img.originalPrompt || ""}
                            finalPrompt={img.finalPrompt || ""}
                            totalAttempts={img.totalAttempts || 1}
                            attempts={img.attempts}
                          />
                        )}
                        {img.revised_prompt && (
                          <p className="text-white text-[10px] line-clamp-2">{img.revised_prompt}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                        {img.cachedId && (
                          <Button
                            variant="secondary" size="icon"
                            className={`h-7 w-7 shrink-0 ${favIds.has(img.cachedId) ? "text-yellow-400" : ""}`}
                            onClick={() => { if (img.cachedId) favToggle.mutate({ cachedContentId: img.cachedId }); }}
                          >
                            <Star className={`h-3.5 w-3.5 ${img.cachedId && favIds.has(img.cachedId) ? "fill-current" : ""}`} />
                          </Button>
                        )}
                        <Button variant="secondary" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDownload(img.url, i)} title="Download">
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="secondary" size="icon"
                          className="h-7 w-7 shrink-0"
                          title="Send to Image Edit"
                          onClick={() => {
                            chain({ url: img.url, prompt: prompt, target: "image_edit" });
                            setLocation("/images/edit");
                            toast.success("Image sent to Edit page");
                          }}
                        >
                          <Paintbrush className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* MediaViewer lightbox */}
      <MediaViewer
        items={mediaItems}
        initialIndex={viewerIndex}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        onFavorite={(item) => {
          if (item.cachedId) favToggle.mutate({ cachedContentId: item.cachedId });
        }}
        isFavorited={(item) => item.cachedId ? favIds.has(item.cachedId) : false}
        onSendToEdit={(item) => {
          chain({ url: item.url, prompt: item.prompt, target: "image_edit" });
          setLocation("/images/edit");
          setViewerOpen(false);
          toast.success("Image sent to Edit page");
        }}
      />

      <ContentHistory
        type="image"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestore={(item) => {
          if (item.contentUrl) {
            setImages((prev) => [{ url: item.contentUrl!, revised_prompt: (item.metadata as any)?.revised_prompt, cachedId: item.id }, ...prev]);
          }
        }}
        renderItem={(item) => (
          <div className="space-y-2">
            {item.contentUrl && (
              <img src={item.contentUrl} alt={item.title || "Cached image"} className="w-full rounded-md aspect-video object-cover" loading="lazy" />
            )}
            <p className="text-xs text-muted-foreground line-clamp-2">{item.prompt || item.title}</p>
          </div>
        )}
      />
    </div>
  );
}
