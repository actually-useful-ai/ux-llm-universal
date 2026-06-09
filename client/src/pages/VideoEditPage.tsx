// ============================================================
// VideoEditPage — Grok Imagine video editing (xAI-only, tRPC path)
// Ported from ux-llm-media in Stage 4 of the universal merge.
// Multi-provider video generation lives on /create (dreamer-proxy);
// this surface keeps media's xAI-specific extras: async polling,
// auto-retry rewrites, extend-video, original-vs-edited compare.
// ============================================================
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { downloadMedia, downloadAllMedia, downloadAsZip } from "@/lib/download";
import { Loader2, Film, Upload, Download, X, Clock, History, Trash2, ArrowRight, Star, Settings2, Archive } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import ContentHistory from "@/components/ContentHistory";
import PromptLibrary from "@/components/PromptLibrary";
import { AutoRetryToggle } from "@/components/AutoRetryBadge";
import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { MediaViewer, type MediaItem } from "@/components/MediaViewer";
import { KeyboardShortcutsHelp } from "@/components/KeyboardShortcutsHelp";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { usePromptChain } from "@/contexts/PromptChainContext";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const RESOLUTIONS = [
  { value: "auto", label: "Auto" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
];

const ASPECT_RATIOS = [
  { value: "auto", label: "Auto" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
];

const DURATIONS = [
  { value: "auto", label: "Auto" },
  { value: "5", label: "5s" },
  { value: "10", label: "10s" },
];

type VideoJob = {
  requestId: string;
  prompt: string;
  status: "processing" | "done" | "error";
  videoUrl?: string;
  startedAt: number;
  wasRewritten?: boolean;
  cachedId?: number;
};

export default function VideoEditPage() {
  const [prompt, setPrompt] = useState("");
  const [sourceVideo, setSourceVideo] = useState<string | null>(null);
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null);
  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [autoRetry, setAutoRetry] = useState(true);
  const [maxRetries, setMaxRetries] = useState(3);
  const [resolution, setResolution] = useState("auto");
  const [aspectRatio, setAspectRatio] = useState("auto");
  const [duration, setDuration] = useState("auto");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // MediaViewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [compareIndex, setCompareIndex] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { consume } = usePromptChain();

  // Consume any chained URL from a previous generation page
  useEffect(() => {
    const payload = consume();
    if (payload && payload.target === "video_edit") {
      setSourceVideoUrl(payload.url);
      if (payload.prompt) setPrompt(payload.prompt);
      toast.info("Video loaded from generation — add your edit prompt and generate!");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMutation = trpc.cache.save.useMutation({
    onSuccess: () => utils.cache.list.invalidate({ type: "video_edit" }),
  });

  const favToggle = trpc.favorites.toggle.useMutation({
    onSuccess: () => utils.favorites.ids.invalidate(),
  });
  const favIdsQuery = trpc.favorites.ids.useQuery(undefined, { staleTime: 30_000, refetchOnWindowFocus: false });
  const favIds = new Set(favIdsQuery.data || []);

  const uploadMutation = trpc.xaiGen.uploadVideo.useMutation();

  const startPolling = useCallback((requestId: string, jobPrompt: string) => {
    const poll = async () => {
      try {
        // Typed tRPC client call (base-path safe), not a hand-built /api/trpc URL
        const result: any = await utils.client.xaiGen.videoStatus.query({ requestId });

        if (result?.status === "processing") {
          const timer = setTimeout(poll, 5000);
          pollTimers.current.set(requestId, timer);
        } else if (result?.video?.url || result?.status === "done") {
          const videoUrl = result.video?.url;
          setJobs(prev => prev.map(j => j.requestId === requestId ? { ...j, status: "done", videoUrl } : j));
          pollTimers.current.delete(requestId);
          toast.success("Video edit complete!");
          if (videoUrl) {
            saveMutation.mutate({
              type: "video_edit",
              title: jobPrompt.slice(0, 100),
              prompt: jobPrompt,
              contentUrl: videoUrl,
              model: "grok-imagine-video",
            });
          }
        } else {
          const timer = setTimeout(poll, 5000);
          pollTimers.current.set(requestId, timer);
        }
      } catch {
        const timer = setTimeout(poll, 10000);
        pollTimers.current.set(requestId, timer);
      }
    };
    const timer = setTimeout(poll, 5000);
    pollTimers.current.set(requestId, timer);
  }, [saveMutation, utils.client]);

  useEffect(() => {
    return () => { pollTimers.current.forEach(timer => clearTimeout(timer)); };
  }, []);

  const editMutation = trpc.xaiGen.videoEdit.useMutation({
    onSuccess: (data: any) => {
      if (data.request_id) {
        const job: VideoJob = { requestId: data.request_id, prompt: prompt.trim(), status: "processing", startedAt: Date.now() };
        setJobs(prev => [job, ...prev]);
        startPolling(data.request_id, prompt.trim());
        toast.success("Video edit started.");
      }
    },
    onError: (error) => toast.error(`Video edit failed: ${error.message}`),
  });

  const autoRetryMutation = trpc.autoRetry.videoEdit.useMutation({
    onSuccess: (data: any) => {
      if (data.request_id) {
        const job: VideoJob = {
          requestId: data.request_id,
          prompt: data.finalPrompt || prompt.trim(),
          status: "processing",
          startedAt: Date.now(),
          wasRewritten: data.wasRewritten,
        };
        setJobs(prev => [job, ...prev]);
        startPolling(data.request_id, data.finalPrompt || prompt.trim());
        if (data.wasRewritten) {
          toast.success(`Video edit started after ${data.totalAttempts} attempts (prompt rewritten)`);
        } else {
          toast.success("Video edit started.");
        }
      }
    },
    onError: (error) => toast.error(`Video edit failed: ${error.message}`),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) { toast.error("Please select a video file"); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error("Video must be under 50MB"); return; }
    const reader = new FileReader();
    reader.onload = () => { setSourceVideo(reader.result as string); setSourceVideoUrl(null); };
    reader.readAsDataURL(file);
  };

  const handleEdit = async () => {
    if (!prompt.trim() || (!sourceVideo && !sourceVideoUrl)) return;
    try {
      let videoUrl = sourceVideoUrl;
      if (!videoUrl && sourceVideo) {
        const base64 = sourceVideo.split(",")[1];
        const mimeMatch = sourceVideo.match(/data:([^;]+);/);
        const mimeType = mimeMatch?.[1] || "video/mp4";
        const result = await uploadMutation.mutateAsync({ base64, mimeType });
        videoUrl = result.url;
        setSourceVideoUrl(videoUrl);
      }
      const opts: Record<string, unknown> = {};
      if (resolution !== "auto") opts.resolution = resolution;
      if (aspectRatio !== "auto") opts.aspect_ratio = aspectRatio;
      if (duration !== "auto") opts.duration = parseInt(duration);

      if (autoRetry) {
        autoRetryMutation.mutate({ prompt: prompt.trim(), video_url: videoUrl!, maxRetries, ...opts });
      } else {
        editMutation.mutate({ prompt: prompt.trim(), video_url: videoUrl!, ...opts });
      }
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`);
    }
  };

  const extendMutation = trpc.xaiGen.videoExtend.useMutation({
    onSuccess: (data: any) => {
      if (data.request_id) {
        const job: VideoJob = { requestId: data.request_id, prompt: "Extended video", status: "processing", startedAt: Date.now() };
        setJobs(prev => [job, ...prev]);
        startPolling(data.request_id, "Extended video");
        toast.success("Video extension started!");
      }
    },
    onError: (error) => toast.error(`Video extension failed: ${error.message}`),
  });

  const handleExtend = (videoUrl: string) => {
    extendMutation.mutate({ video_url: videoUrl, prompt: "Continue this video seamlessly, maintaining the same style, motion, and subject" });
  };

  const isPending = uploadMutation.isPending || editMutation.isPending || autoRetryMutation.isPending;

  const handleDownload = async (url: string) => {
    try {
      await downloadMedia(url, `grok-edited-video-${Date.now()}.mp4`);
    } catch { toast.error("Failed to download video"); }
  };

  const handleDownloadAll = async () => {
    const completed = jobs.filter(j => j.videoUrl);
    if (completed.length === 0) return;
    toast.info(`Downloading ${completed.length} videos...`);
    await downloadAllMedia(
      completed.map((j, i) => ({ url: j.videoUrl!, filename: `grok-edited-video-${Date.now()}-${i}.mp4` })),
      (done, total) => { if (done === total) toast.success("All videos downloaded"); }
    );
  };

  // MediaViewer items
  const completedJobs = jobs.filter(j => j.videoUrl);
  const mediaItems: MediaItem[] = completedJobs.map(j => ({
    type: "video" as const,
    url: j.videoUrl!,
    title: j.prompt,
    prompt: j.prompt,
    cachedId: j.cachedId,
    metadata: { wasRewritten: j.wasRewritten },
  }));

  const openViewer = (videoUrl: string) => {
    const idx = completedJobs.findIndex(j => j.videoUrl === videoUrl);
    if (idx >= 0) { setViewerIndex(idx); setViewerOpen(true); }
  };

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      keys: "ctrl+enter",
      description: "Edit video",
      handler: () => { if (!isPending && prompt.trim() && sourceVideo) handleEdit(); },
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
          <Film className="h-4 w-4 text-primary shrink-0" />
          <h1 className="font-semibold text-sm truncate">Video Editing</h1>
          <span className="text-[10px] text-muted-foreground font-mono hidden sm:inline">grok-imagine-video</span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {jobs.length > 0 && (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={async () => {
                const completed = jobs.filter(j => j.videoUrl);
                if (completed.length === 0) return;
                const toastId = toast.loading(`Preparing ZIP (0/${completed.length})...`);
                try {
                  await downloadAsZip(
                    completed.map((j, i) => ({ url: j.videoUrl!, filename: `grok-edited-video-${i + 1}.mp4` })),
                    `grok-edited-videos-${Date.now()}.zip`,
                    (done, total) => {
                      if (done < total) toast.loading(`Preparing ZIP (${done + 1}/${total})...`, { id: toastId });
                      else toast.success(`ZIP ready with ${total} videos`, { id: toastId });
                    }
                  );
                } catch { toast.error("Failed to create ZIP", { id: toastId }); }
              }} title="Download all as ZIP">
                <Archive className="h-3 w-3" /> <span className="hidden sm:inline">ZIP</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={handleDownloadAll} title="Download individually">
                <Download className="h-3 w-3" /> <span className="hidden sm:inline">All</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2 text-destructive hover:text-destructive" onClick={() => { pollTimers.current.forEach(t => clearTimeout(t)); pollTimers.current.clear(); setJobs([]); }}>
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
              <Label className="text-[11px] font-medium">Source Video</Label>
              <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} className="hidden" />
              {(sourceVideo || sourceVideoUrl) ? (
                <div className="mt-1 relative group">
                  <video src={sourceVideo || sourceVideoUrl!} controls className="w-full rounded-lg border aspect-video" />
                  <button onClick={() => { setSourceVideo(null); setSourceVideoUrl(null); }} className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button onClick={() => fileInputRef.current?.click()} className="mt-1 w-full h-20 rounded-lg border border-dashed border-border hover:border-primary/50 transition-colors flex flex-col items-center justify-center gap-1 text-muted-foreground">
                  <Upload className="h-5 w-5 opacity-40" />
                  <span className="text-[10px]">Click to upload a video</span>
                </button>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label className="text-[11px] font-medium">Edit Instructions</Label>
                <PromptLibrary category="video_edit" currentPrompt={prompt} onSelectPrompt={setPrompt} />
              </div>
              <Textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Describe how to edit the video..." className="h-20 resize-none text-sm" />
            </div>

            {/* Video controls */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] font-medium">Resolution</Label>
                <Select value={resolution} onValueChange={setResolution}>
                  <SelectTrigger className="mt-1 h-7 text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{RESOLUTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] font-medium">Aspect Ratio</Label>
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger className="mt-1 h-7 text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{ASPECT_RATIOS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] font-medium">Duration</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger className="mt-1 h-7 text-[11px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{DURATIONS.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-medium">Auto-Retry</Label>
              <AutoRetryToggle enabled={autoRetry} onToggle={setAutoRetry} maxRetries={maxRetries} onMaxRetriesChange={setMaxRetries} />
            </div>

            <Button onClick={handleEdit} disabled={!prompt.trim() || (!sourceVideo && !sourceVideoUrl) || isPending} className="w-full h-9 text-sm">
              {isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {uploadMutation.isPending ? "Uploading..." : "Submitting..."}</>
              ) : (
                <><Film className="h-4 w-4 mr-2" /> Edit Video</>
              )}
            </Button>
          </div>
          </CollapsiblePanel>
        </div>

        <div className="flex-1 min-h-0">
          {jobs.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground p-4">
              <div className="text-center space-y-2">
                <Film className="h-12 w-12 mx-auto opacity-15" />
                <p className="text-sm">Upload a video and describe your edits</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 p-2 sm:p-4">
                {jobs.map(job => (
                  <div key={job.requestId} className="rounded-lg border bg-card overflow-hidden">
                    {job.status === "processing" ? (
                      <div className="aspect-video flex flex-col items-center justify-center gap-2 bg-muted/30">
                        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
                        <div className="text-center">
                          <p className="text-xs font-medium">Processing...</p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3" /><ElapsedTimer startedAt={job.startedAt} />
                          </p>
                        </div>
                        <Progress value={undefined} className="w-24 h-1" />
                      </div>
                    ) : job.videoUrl ? (
                      <div className="cursor-pointer" onClick={() => openViewer(job.videoUrl!)}>
                        <video src={job.videoUrl} className="w-full aspect-video" preload="metadata" />
                      </div>
                    ) : (
                      <div className="aspect-video flex items-center justify-center bg-destructive/10">
                        <span className="text-xs text-destructive">Failed</span>
                      </div>
                    )}
                    <div className="p-2 flex items-center justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-muted-foreground truncate">{job.prompt}</p>
                        {job.wasRewritten && <span className="text-[9px] text-amber-400">rewritten</span>}
                      </div>
                      {job.status === "done" && job.videoUrl && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          {job.cachedId && (
                            <Button variant="ghost" size="icon" className={`h-6 w-6 ${favIds.has(job.cachedId) ? "text-yellow-400" : ""}`} onClick={() => favToggle.mutate({ cachedContentId: job.cachedId! })}>
                              <Star className={`h-3 w-3 ${job.cachedId && favIds.has(job.cachedId) ? "fill-current" : ""}`} />
                            </Button>
                          )}
                          {(sourceVideo || sourceVideoUrl) && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" title="Compare with original" onClick={() => {
                              const idx = completedJobs.findIndex(j => j.videoUrl === job.videoUrl);
                              setCompareIndex(idx >= 0 ? idx : null);
                            }}>
                              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="text-current"><path d="M1 7h12M5 3l-4 4 4 4M9 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleExtend(job.videoUrl!)} disabled={extendMutation.isPending} title="Extend">
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDownload(job.videoUrl!)}>
                            <Download className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Comparison Modal - original vs edited video */}
      {compareIndex !== null && (sourceVideo || sourceVideoUrl) && completedJobs[compareIndex]?.videoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setCompareIndex(null)}
        >
          <div className="w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-white text-sm font-medium">Original vs Edited</p>
              <Button variant="ghost" size="icon" className="text-white hover:text-white/80" onClick={() => setCompareIndex(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-white/60 text-xs mb-1 text-center">Original</p>
                <video src={sourceVideo || sourceVideoUrl!} className="w-full rounded-lg" controls />
              </div>
              <div>
                <p className="text-white/60 text-xs mb-1 text-center">Edited</p>
                <video src={completedJobs[compareIndex].videoUrl} className="w-full rounded-lg" controls />
              </div>
            </div>
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
        type="video_edit"
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestore={(item) => {
          if (item.contentUrl) {
            setJobs(prev => [{ requestId: `cached-${item.id}`, prompt: item.prompt || "", status: "done" as const, videoUrl: item.contentUrl!, startedAt: new Date(item.createdAt).getTime(), cachedId: item.id }, ...prev]);
          }
        }}
        renderItem={(item) => (
          <div className="space-y-2">
            {item.contentUrl && <video src={item.contentUrl} className="w-full rounded-md aspect-video" preload="metadata" controls />}
            <p className="text-xs text-muted-foreground line-clamp-2">{item.prompt || item.title}</p>
          </div>
        )}
      />
    </div>
  );
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return <>{`${mins}:${secs.toString().padStart(2, "0")}`}</>;
}
