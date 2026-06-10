// ============================================================
// VideoGenPanel — Video generation with xAI/OpenAI Sora
// Supports polling via JobContext, duration/resolution/aspect controls
// ============================================================

import { useState, useMemo, useEffect } from 'react';
import { Video, Loader2, Sparkles, AlertTriangle, Download, Play, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useProviders } from '@/contexts/ProviderContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useJobs, type VideoJob, type Job } from '@/contexts/JobContext';
import { useArtifacts } from '@/contexts/ArtifactContext';
import { apiUrl } from '@/lib/api-base';
import { PresetPicker } from '@/components/PresetPicker';
import { motion, AnimatePresence } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { cn } from '@/lib/utils';

const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const;
const RESOLUTIONS = ['auto', '720p', '1080p'] as const;
const XAI_DURATIONS = [4, 6, 8, 10] as const;
const SORA_DURATIONS = [5, 10, 15, 20] as const;
const SORA_SIZES = ['1280x720', '720x1280', '1920x1080', '1080x1920'] as const;

function ElapsedTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {mins}:{secs.toString().padStart(2, '0')}
    </span>
  );
}

export default function VideoGenPanel() {
  const { themeName } = useTheme();
  const { providers } = useProviders();
  const { addJob, updateJob, startVideoPolling, getJobsByType, onJobComplete } = useJobs();
  const { saveArtifact } = useArtifacts();
  const [prompt, setPrompt] = useState('');

  // Save completed video jobs as artifacts for gallery persistence
  useEffect(() => {
    return onJobComplete((job: Job) => {
      if (job.type === 'video' && job.status === 'done') {
        const vJob = job as VideoJob;
        if (vJob.videoUrl) {
          saveArtifact({
            type: 'video',
            url: vJob.videoUrl,
            prompt: vJob.prompt,
            provider: vJob.provider,
            model: vJob.model,
          });
        }
      }
    });
  }, [onJobComplete, saveArtifact]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter to video-capable providers
  const videoProviders = useMemo(
    () => providers.filter((p: any) => p.capabilities?.includes('video_generation') && p.videoGenModels?.length),
    [providers],
  );

  const [selectedProvider, setSelectedProvider] = useState<string>(() =>
    videoProviders[0]?.id || 'xai',
  );
  const currentProvider = videoProviders.find((p: any) => p.id === selectedProvider) || videoProviders[0];

  const [selectedModel, setSelectedModel] = useState<string>(() =>
    (currentProvider as any)?.videoGenDefault || (currentProvider as any)?.videoGenModels?.[0] || '',
  );

  // xAI settings
  const [duration, setDuration] = useState(6);
  const [resolution, setResolution] = useState<string>('auto');
  const [aspectRatio, setAspectRatio] = useState<string>('16:9');

  // Sora settings
  const [soraSize, setSoraSize] = useState<string>('1920x1080');
  const [soraDuration, setSoraDuration] = useState(10);

  // Bulk generation
  const [quantity, setQuantity] = useState(1);

  const videoJobs = getJobsByType('video') as VideoJob[];

  const handleProviderChange = (id: string) => {
    setSelectedProvider(id);
    const p = videoProviders.find((pr: any) => pr.id === id);
    setSelectedModel((p as any)?.videoGenDefault || (p as any)?.videoGenModels?.[0] || '');
  };

  // ── Presets ─────────────────────────────────────────────────────
  const getCurrentSettings = () => ({
    provider: selectedProvider, model: selectedModel, duration, resolution,
    aspectRatio, soraSize, soraDuration, quantity,
  });

  // Provider first (it resets the model), then explicit keys override.
  const applyPreset = (s: Record<string, unknown>) => {
    if (typeof s.provider === 'string' && videoProviders.some((p: any) => p.id === s.provider)) {
      handleProviderChange(s.provider);
    }
    if (typeof s.model === 'string') setSelectedModel(s.model);
    if (typeof s.duration === 'number') setDuration(s.duration);
    if (typeof s.resolution === 'string') setResolution(s.resolution);
    if (typeof s.aspectRatio === 'string') setAspectRatio(s.aspectRatio);
    if (typeof s.soraSize === 'string') setSoraSize(s.soraSize);
    if (typeof s.soraDuration === 'number') setSoraDuration(s.soraDuration);
    if (typeof s.quantity === 'number') setQuantity(s.quantity);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !selectedProvider) return;
    setIsSubmitting(true);
    setError(null);

    const p = prompt.trim();
    const errors: string[] = [];

    // Fire all requests in parallel for bulk generation
    const promises = Array.from({ length: quantity }, async (_, i) => {
      const jobId = uuidv4();

      try {
        const body: Record<string, unknown> = {
          prompt: p,
          provider: selectedProvider,
          model: selectedModel || undefined,
        };

        if (selectedProvider === 'xai') {
          body.duration = duration;
          if (resolution !== 'auto') body.resolution = resolution;
          body.aspect_ratio = aspectRatio;
        } else if (selectedProvider === 'openai') {
          body.seconds = soraDuration;
          body.size = soraSize;
        }

        const res = await fetch(apiUrl('/api/video/generate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(data.error || `Generation failed (${res.status})`);
        }

        const data = await res.json();
        const requestId = data.requestId;

        if (!requestId) throw new Error('No request ID returned');

        const job: VideoJob = {
          id: jobId,
          type: 'video',
          status: 'processing',
          prompt: quantity > 1 ? `${p} (${i + 1}/${quantity})` : p,
          provider: selectedProvider,
          model: selectedModel,
          requestId,
          startedAt: Date.now(),
        };
        addJob(job);
        startVideoPolling(requestId, jobId, p, selectedProvider);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : 'Generation failed');
      }
    });

    await Promise.allSettled(promises);

    if (errors.length > 0) {
      setError(errors.length === quantity ? errors[0] : `${errors.length}/${quantity} failed: ${errors[0]}`);
    }
    setPrompt('');
    setIsSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !isSubmitting) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleExtend = async (videoUrl: string) => {
    try {
      const res = await fetch(apiUrl('/api/video/extend'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: videoUrl, provider: 'xai' }),
      });

      if (!res.ok) throw new Error('Extend failed');

      const data = await res.json();
      if (data.requestId) {
        const jobId = uuidv4();
        const job: VideoJob = {
          id: jobId,
          type: 'video',
          status: 'processing',
          prompt: '(extended)',
          provider: 'xai',
          requestId: data.requestId,
          startedAt: Date.now(),
        };
        addJob(job);
        startVideoPolling(data.requestId, jobId, '(extended)', 'xai');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extend failed');
    }
  };

  const noProviders = videoProviders.length === 0;
  const isXAI = selectedProvider === 'xai';

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Results area */}
      <div className="flex-1 overflow-y-auto chat-scroll p-4">
        {noProviders ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center',
              themeName === 'nebula' ? 'bg-indigo-900/20' : themeName === 'slate' ? 'bg-teal-900/20' : 'bg-amber-900/20',
            )}>
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="text-center">
              <p className="eyebrow mb-2">NO VIDEO PROVIDERS</p>
              <p className="text-sm">Add an API key for xAI or OpenAI in your server .env</p>
            </div>
          </div>
        ) : videoJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center',
              themeName === 'nebula' ? 'bg-indigo-900/20' : themeName === 'slate' ? 'bg-teal-900/20' : 'bg-amber-900/20',
            )}>
              <Video className="w-8 h-8" />
            </div>
            <div className="text-center">
              <p className="eyebrow mb-2">VIDEO GENERATION</p>
              <p className="text-sm">Describe a video to generate it</p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                Using {(currentProvider as any)?.name || selectedProvider}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
            <AnimatePresence>
              {videoJobs.map((job) => (
                <motion.div
                  key={job.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-xl overflow-hidden border border-border bg-card"
                >
                  {job.status === 'processing' ? (
                    <div className="aspect-video flex flex-col items-center justify-center gap-3 bg-muted/50">
                      <Loader2 className="w-8 h-8 animate-spin text-primary/60" />
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                        <ElapsedTimer startTime={job.startedAt} />
                      </div>
                      <p className="text-xs text-muted-foreground/60 max-w-[200px] text-center truncate">
                        {job.prompt}
                      </p>
                    </div>
                  ) : job.status === 'done' && job.videoUrl ? (
                    <div className="relative group">
                      <video
                        src={job.videoUrl}
                        controls
                        className="w-full aspect-video object-cover"
                        preload="metadata"
                      />
                      <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={job.videoUrl}
                          download
                          className="h-7 w-7 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        {job.provider === 'xai' && (
                          <button
                            onClick={() => handleExtend(job.videoUrl!)}
                            className="h-7 w-7 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                            title="Extend video"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ) : job.status === 'error' ? (
                    <div className="aspect-video flex flex-col items-center justify-center gap-2 bg-destructive/5">
                      <AlertTriangle className="w-6 h-6 text-destructive/60" />
                      <p className="text-xs text-destructive/80 max-w-[200px] text-center">{job.error}</p>
                    </div>
                  ) : null}

                  <div className="px-3 py-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground line-clamp-1">{job.prompt}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] text-muted-foreground/50">{job.provider}</span>
                      {job.model && <span className="text-[10px] text-muted-foreground/40">{job.model}</span>}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

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

      {/* Input bar */}
      {!noProviders && (
        <div className="border-t border-border bg-background/80 backdrop-blur-sm px-4 py-3">
          <div className="max-w-3xl mx-auto space-y-2">
            <PresetPicker feature="video_gen" getCurrentSettings={getCurrentSettings} onApply={applyPreset} />

            {/* Provider + model + settings */}
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={selectedProvider} onValueChange={handleProviderChange}>
                <SelectTrigger className="h-7 text-xs border-border/60 bg-transparent w-auto min-w-[100px]">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  {videoProviders.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-7 text-xs border-border/60 bg-transparent w-auto min-w-[120px]">
                  <SelectValue placeholder="Model" />
                </SelectTrigger>
                <SelectContent>
                  {((currentProvider as any)?.videoGenModels || []).map((m: string) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Duration */}
              <Select value={String(isXAI ? duration : soraDuration)} onValueChange={v => isXAI ? setDuration(Number(v)) : setSoraDuration(Number(v))}>
                <SelectTrigger className="h-7 text-xs border-border/60 bg-transparent w-auto min-w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(isXAI ? XAI_DURATIONS : SORA_DURATIONS).map(d => (
                    <SelectItem key={d} value={String(d)}>{d}s</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* xAI-specific: resolution + aspect ratio */}
              {isXAI && (
                <>
                  <Select value={resolution} onValueChange={setResolution}>
                    <SelectTrigger className="h-7 text-xs border-border/60 bg-transparent w-auto min-w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOLUTIONS.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-0.5">
                    {ASPECT_RATIOS.map(ar => (
                      <button
                        key={ar}
                        onClick={() => setAspectRatio(ar)}
                        className={cn(
                          'px-1.5 py-0.5 text-[10px] rounded transition-colors',
                          aspectRatio === ar
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                        )}
                      >
                        {ar}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Sora-specific: size */}
              {!isXAI && selectedProvider === 'openai' && (
                <Select value={soraSize} onValueChange={setSoraSize}>
                  <SelectTrigger className="h-7 text-xs border-border/60 bg-transparent w-auto min-w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORA_SIZES.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Quantity */}
              <Select value={String(quantity)} onValueChange={v => setQuantity(Number(v))}>
                <SelectTrigger className="h-7 text-xs border-border/60 bg-transparent w-auto min-w-[50px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map(q => (
                    <SelectItem key={q} value={String(q)}>{q}x</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Prompt input */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe the video you want to generate..."
                  rows={1}
                  disabled={isSubmitting}
                  className="w-full resize-none border border-border bg-card px-4 py-3 text-[15px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all disabled:opacity-50 rounded-xl"
                />
              </div>
              <Button
                size="sm"
                disabled={!prompt.trim() || isSubmitting}
                onClick={handleGenerate}
                className="h-10 w-10 shrink-0 p-0 rounded-full"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
