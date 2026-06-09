// ============================================================
// ImageEditPage — Grok Imagine image editing (xAI-only, tRPC path)
// Ported from ux-llm-media in Stage 4 of the universal merge.
// OpenAI/Gemini editing stays on /create (dreamer-proxy).
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
import { Loader2, Paintbrush, Upload, Download, X, History, Trash2, Star, Settings2, Archive } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import ContentHistory from "@/components/ContentHistory";
import PromptLibrary from "@/components/PromptLibrary";
import { AutoRetryToggle, AutoRetryBadge } from "@/components/AutoRetryBadge";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { MediaViewer, type MediaItem } from "@/components/MediaViewer";
import { ComparisonSlider } from "@/components/ComparisonSlider";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePromptChain } from "@/contexts/PromptChainContext";

const IMAGE_SIZES = [
  { value: "auto", label: "Auto" },
  { value: "1024x1024", label: "1024×1024 (Square)" },
  { value: "1024x1536", label: "1024×1536 (Portrait)" },
  { value: "1536x1024", label: "1536×1024 (Landscape)" },
  { value: "768x768", label: "768×768" },
  { value: "768x1344", label: "768×1344 (Tall)" },
  { value: "1344x768", label: "1344×768 (Wide)" },
];

type EditedImage = {
  url: string;
  revised_prompt?: string;
  wasRewritten?: boolean;
  originalPrompt?: string;
  finalPrompt?: string;
  totalAttempts?: number;
  attempts?: Array<{ prompt: string; error?: string }>;
  cachedId?: number;
};

export default function ImageEditPage() {
  const [prompt, setPrompt] = useState("");
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [numEdits, setNumEdits] = useState(1);
  const [size, setSize] = useState("auto");
  const [results, setResults] = useState<EditedImage[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [autoRetry, setAutoRetry] = useState(true);
  const [maxRetries, setMaxRetries] = useState(3);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // MediaViewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const { consume } = usePromptChain();

  // Consume any chained URL from a previous generation page
  useEffect(() => {
    const payload = consume();
    if (payload && payload.target === "image_edit") {
      setSourceImageUrl(payload.url);
      if (payload.prompt) setPrompt(payload.prompt);
      toast.info("Image loaded from generation — add your edit prompt and generate!");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const utils = trpc.useUtils();

  const favToggle = trpc.favorites.toggle.useMutation({
    onSuccess: () => utils.favorites.ids.invalidate(),
  });

  const favIdsQuery = trpc.favorites.ids.useQuery(undefined, { staleTime: 30_000, refetchOnWindowFocus: false });
  const favIds = new Set(favIdsQuery.data || []);

  const uploadMutation = trpc.xaiGen.uploadImage.useMutation();
  const editMutation = trpc.xaiGen.imageEdit.useMutation();
  const autoRetryMutation = trpc.autoRetry.imageEdit.useMutation();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image file"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("Image must be under 20MB"); return; }
    const reader = new FileReader();
    reader.onload = () => { setSourceImage(reader.result as string); setSourceImageUrl(null); };
    reader.readAsDataURL(file);
  };

  const handleEdit = async () => {
    if (!prompt.trim() || (!sourceImage && !sourceImageUrl)) return;
    try {
      let imageUrl = sourceImageUrl;
      if (!imageUrl && sourceImage) {
        const base64 = sourceImage.split(",")[1];
        const mimeMatch = sourceImage.match(/data:([^;]+);/);
        const mimeType = mimeMatch?.[1] || "image/png";
        const result = await uploadMutation.mutateAsync({ base64, mimeType });
        imageUrl = result.url;
        setSourceImageUrl(imageUrl);
      }

      const p = prompt.trim();

      const extraParams: Record<string, unknown> = {};
      if (numEdits > 1) extraParams.n = numEdits;
      if (size !== "auto") extraParams.size = size;

      const onSuccess = (data: any) => {
        if (data.data) {
          const newImages = data.data.map((d: any) => ({
            url: d.url, revised_prompt: d.revised_prompt, cachedId: d.cachedId,
            wasRewritten: data.wasRewritten, originalPrompt: data.originalPrompt,
            finalPrompt: data.finalPrompt, totalAttempts: data.totalAttempts, attempts: data.attempts,
          }));
          setResults((prev) => [...newImages, ...prev]);
          if (data.wasRewritten) {
            toast.success(`Edited after ${data.totalAttempts} attempts (prompt was auto-rewritten)`);
          } else {
            toast.success(`Generated ${data.data.length} edited image${data.data.length > 1 ? "s" : ""}`);
          }
        }
      };

      if (autoRetry) {
        autoRetryMutation.mutate(
          { prompt: p, image_url: imageUrl!, maxRetries, ...extraParams },
          { onSuccess, onError: (error) => toast.error(`Image edit failed: ${error.message}`) }
        );
      } else {
        editMutation.mutate(
          { prompt: p, image_url: imageUrl!, ...extraParams },
          { onSuccess, onError: (error) => toast.error(`Image edit failed: ${error.message}`) }
        );
      }
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`);
    }
  };

  const isPending = uploadMutation.isPending || editMutation.isPending || autoRetryMutation.isPending;

  const handleDownload = async (url: string, index: number) => {
    try {
      await downloadMedia(url, `grok-edited-${Date.now()}-${index}.png`);
    } catch { toast.error("Failed to download image"); }
  };

  const handleDownloadAll = async () => {
    if (results.length === 0) return;
    toast.info(`Downloading ${results.length} images...`);
    await downloadAllMedia(
      results.map((r, i) => ({ url: r.url, filename: `grok-edited-${Date.now()}-${i}.png` })),
      (done, total) => { if (done === total) toast.success("All images downloaded"); }
    );
  };

  // MediaViewer items
  const mediaItems: MediaItem[] = results.map(img => ({
    type: "image" as const,
    url: img.url,
    title: img.revised_prompt || "Edited image",
    prompt: img.originalPrompt || prompt,
    revisedPrompt: img.revised_prompt,
    cachedId: img.cachedId,
    metadata: { wasRewritten: img.wasRewritten, totalAttempts: img.totalAttempts },
  }));

  // Comparison slider state - show original vs edited for selected result
  const [compareIndex, setCompareIndex] = useState<number | null>(null);

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      keys: "ctrl+enter",
      description: "Edit image",
      handler: () => { if (!isPending && prompt.trim() && sourceImage) handleEdit(); },
      noInputFocus: false,
    },
    {
      keys: "escape",
      description: "Close comparison",
      handler: () => setCompareIndex(null),
      noInputFocus: false,
    },
  ]);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto lg:overflow-hidden">
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b bg-background/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Paintbrush className="h-4 w-4 text-primary shrink-0" />
          <h1 className="font-semibold text-sm truncate">Image Editing</h1>
          <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">grok-imagine</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <KeyboardShortcutsHelp />
          {results.length > 0 && (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={async () => {
                if (results.length === 0) return;
                const toastId = toast.loading(`Preparing ZIP (0/${results.length})...`);
                try {
                  await downloadAsZip(
                    results.map((r, i) => ({ url: r.url, filename: `grok-edited-${i + 1}.png` })),
                    `grok-edited-${Date.now()}.zip`,
                    (done, total) => {
                      if (done < total) toast.loading(`Preparing ZIP (${done + 1}/${total})...`, { id: toastId });
                      else toast.success(`ZIP ready with ${total} images`, { id: toastId });
                    }
                  );
                } catch { toast.error("Failed to create ZIP", { id: toastId }); }
              }} title="Download all as ZIP">
                <Archive className="h-3 w-3" /> <span className="hidden sm:inline">ZIP ({results.length})</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={handleDownloadAll} title="Download individually">
                <Download className="h-3 w-3" /> <span className="hidden sm:inline">All</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2 text-destructive hover:text-destructive" onClick={() => setResults([])}>
                <Trash2 className="h-3 w-3" /> <span className="hidden sm:inline">Clear</span>
              </Button>
            </>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setHistoryOpen(true)}>
            <History className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <div className="lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r bg-background/50 lg:overflow-y-auto">
          <CollapsiblePanel
            title="Edit Settings"
            icon={<Settings2 className="h-3.5 w-3.5 text-muted-foreground" />}
            defaultOpen={true}
            badge={isPending ? <span className="text-[10px] text-primary animate-pulse">Processing...</span> : undefined}
          >
          <div className="p-3 space-y-3">
            <div>
              <Label className="text-[11px] font-medium">Source Image</Label>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
              {(sourceImage || sourceImageUrl) ? (
                <div className="mt-1 relative group">
                  <img src={sourceImage || sourceImageUrl!} alt="Source" className="w-full rounded-lg border object-cover aspect-square" />
                  <button onClick={() => { setSourceImage(null); setSourceImageUrl(null); }} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button onClick={() => fileInputRef.current?.click()} className="mt-1 w-full h-20 rounded-lg border border-dashed border-border hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground">
                  <Upload className="h-5 w-5 opacity-40" />
                  <span className="text-[10px]">Click to upload an image</span>
                </button>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-[11px] font-medium">Edit Instructions</Label>
                <PromptLibrary category="image_edit" currentPrompt={prompt} onSelectPrompt={setPrompt} />
              </div>
              <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe how to edit the image..." className="h-20 resize-none text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px] font-medium">Variations</Label>
                <Input type="number" min={1} max={4} value={numEdits} onChange={(e) => { const val = e.target.value; if (val === "") return; setNumEdits(Math.max(1, Math.min(4, parseInt(val) || 1))); }} onFocus={(e) => e.target.select()} className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-[11px] font-medium">Size</Label>
                <Select value={size} onValueChange={setSize}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IMAGE_SIZES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-medium">Auto-Retry</Label>
              <AutoRetryToggle enabled={autoRetry} onToggle={setAutoRetry} maxRetries={maxRetries} onMaxRetriesChange={setMaxRetries} />
            </div>

            <Button onClick={handleEdit} disabled={!prompt.trim() || (!sourceImage && !sourceImageUrl) || isPending} className="w-full h-9 text-sm">
              {isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {uploadMutation.isPending ? "Uploading..." : "Editing..."}</>
              ) : (
                <><Paintbrush className="h-4 w-4 mr-2" /> Edit Image{numEdits > 1 ? ` (${numEdits} variations)` : ""}</>
              )}
            </Button>
          </div>
          </CollapsiblePanel>
        </div>

        <div className="flex-1 min-h-0">
          {results.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground p-4">
              <div className="text-center space-y-2">
                <Paintbrush className="h-12 w-12 mx-auto opacity-15" />
                <p className="text-sm">Upload an image and describe your edits</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 p-2 sm:p-4">
                {results.map((img, i) => (
                  <div key={`${img.url}-${i}`} className="group relative rounded-lg overflow-hidden border bg-card cursor-pointer" onClick={() => openViewer(i)} onDoubleClick={() => sourceImage ? setCompareIndex(i) : undefined}>
                    <img src={img.url} alt={img.revised_prompt || "Edited image"} className="w-full aspect-square object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end justify-between p-2 opacity-0 group-hover:opacity-100">
                      <div className="flex-1 mr-1 space-y-0.5">
                        {img.wasRewritten && (
                          <AutoRetryBadge wasRewritten={true} originalPrompt={img.originalPrompt || ""} finalPrompt={img.finalPrompt || ""} totalAttempts={img.totalAttempts || 1} attempts={img.attempts} />
                        )}
                        {img.revised_prompt && <p className="text-white text-[10px] line-clamp-2">{img.revised_prompt}</p>}
                      </div>
                      <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                        {img.cachedId && (
                          <Button variant="secondary" size="icon" className={`h-7 w-7 shrink-0 ${favIds.has(img.cachedId) ? "text-yellow-400" : ""}`} onClick={() => { if (img.cachedId) favToggle.mutate({ cachedContentId: img.cachedId }); }}>
                            <Star className={`h-3.5 w-3.5 ${img.cachedId && favIds.has(img.cachedId) ? "fill-current" : ""}`} />
                          </Button>
                        )}
                        {(sourceImage || sourceImageUrl) && (
                          <Button variant="secondary" size="icon" className="h-7 w-7 shrink-0" title="Compare with original" onClick={() => setCompareIndex(i)}>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-current"><path d="M1 7h12M5 3l-4 4 4 4M9 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </Button>
                        )}
                        <Button variant="secondary" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDownload(img.url, i)}>
                          <Download className="h-3.5 w-3.5" />
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

      {/* Comparison Slider Modal */}
      {compareIndex !== null && (sourceImage || sourceImageUrl) && results[compareIndex] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setCompareIndex(null)}
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-white text-sm font-medium">Before / After Comparison</p>
              <Button variant="ghost" size="icon" className="text-white hover:text-white/80" onClick={() => setCompareIndex(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ComparisonSlider
              beforeUrl={(sourceImage || sourceImageUrl)!}
              afterUrl={results[compareIndex].url}
              beforeLabel="Original"
              afterLabel="Edited"
              className="w-full aspect-square"
            />
            <p className="text-white/50 text-xs text-center mt-2">Drag the slider to compare · Double-click a result to compare</p>
          </div>
        </div>
      )}

      {/* MediaViewer */}
      <MediaViewer
        items={mediaItems}
        initialIndex={viewerIndex}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        onFavorite={(item) => {
          if (item.cachedId) favToggle.mutate({ cachedContentId: item.cachedId });
        }}
        isFavorited={(item) => item.cachedId ? favIds.has(item.cachedId) : false}
      />

      <ContentHistory
        type="image_edit"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestore={(item) => {
          if (item.contentUrl) {
            setResults((prev) => [{ url: item.contentUrl!, revised_prompt: (item.metadata as any)?.revised_prompt, cachedId: item.id }, ...prev]);
          }
        }}
        renderItem={(item) => (
          <div className="space-y-2">
            {item.contentUrl && <img src={item.contentUrl} alt={item.title || "Cached image"} className="w-full rounded-md aspect-video object-cover" loading="lazy" />}
            <p className="text-xs text-muted-foreground line-clamp-2">{item.prompt || item.title}</p>
          </div>
        )}
      />
    </div>
  );
}
