// ============================================================
// TTSPanel — Text-to-Speech with multi-provider support
// Supports OpenAI, xAI (with speech tags + codec control)
// ============================================================

import { useState, useMemo, useRef, useEffect } from 'react';
import { AudioLines, Loader2, Play, Pause, Download, AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useTheme } from '@/contexts/ThemeContext';
import { useArtifacts } from '@/contexts/ArtifactContext';
import { apiUrl } from '@/lib/api-base';
import { PresetPicker } from '@/components/PresetPicker';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface VoiceInfo {
  id: string;
  name: string;
}

interface ProviderVoiceConfig {
  voices: Array<string | VoiceInfo>;
  defaultVoice: string;
  models: string[];
  supportsCodec?: boolean;
  supportsSpeechTags?: boolean;
  supportsSpeed?: boolean;
}

interface GeneratedAudio {
  id: string;
  text: string;
  audioUrl: string;
  provider: string;
  voice: string;
  codec?: string;
  timestamp: number;
}

const SPEECH_TAGS = [
  { label: 'Pause', tag: '[pause]' },
  { label: 'Breath', tag: '[breath]' },
  { label: 'Laugh', tag: '[laugh]' },
  { label: 'Sigh', tag: '[sigh]' },
  { label: 'Cough', tag: '[cough]' },
  { label: 'Soft', open: '<soft>', close: '</soft>' },
  { label: 'Whisper', open: '<whisper>', close: '</whisper>' },
  { label: 'Emphasis', open: '<emphasis>', close: '</emphasis>' },
];

const CODECS = ['mp3', 'wav', 'pcm', 'mulaw', 'alaw'] as const;
const SAMPLE_RATES = [8000, 16000, 22050, 24000, 44100, 48000] as const;

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'auto', label: 'Auto-detect' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
];

export default function TTSPanel() {
  const { themeName } = useTheme();
  const { saveArtifact } = useArtifacts();
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAudio, setGeneratedAudio] = useState<GeneratedAudio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Provider config
  const [voiceConfig, setVoiceConfig] = useState<Record<string, ProviderVoiceConfig>>({});
  const [selectedProvider, setSelectedProvider] = useState('openai');
  const [selectedVoice, setSelectedVoice] = useState('alloy');
  const [selectedModel, setSelectedModel] = useState('tts-1');
  const [speed, setSpeed] = useState(1.0);
  const [codec, setCodec] = useState<string>('mp3');
  const [sampleRate, setSampleRate] = useState(24000);
  const [language, setLanguage] = useState('en');

  // Batch mode
  const [batchMode, setBatchMode] = useState(false);
  const [batchTexts, setBatchTexts] = useState<string[]>(['']);

  // Fetch voice configuration
  useEffect(() => {
    fetch(apiUrl('/api/tts/voices'))
      .then(r => r.json())
      .then(data => {
        if (data.providers) {
          setVoiceConfig(data.providers);
          const providerIds = Object.keys(data.providers);
          if (providerIds.length > 0 && !data.providers[selectedProvider]) {
            setSelectedProvider(providerIds[0]);
          }
        }
      })
      .catch(() => {});
  }, []);

  const currentConfig = voiceConfig[selectedProvider];
  const voices = useMemo(() => {
    if (!currentConfig?.voices) return [];
    return currentConfig.voices.map(v =>
      typeof v === 'string' ? { id: v, name: v } : v,
    );
  }, [currentConfig]);

  const handleProviderChange = (id: string) => {
    setSelectedProvider(id);
    const config = voiceConfig[id];
    if (config) {
      setSelectedVoice(config.defaultVoice);
      if (config.models?.length) setSelectedModel(config.models[0]);
    }
  };

  // ── Presets ─────────────────────────────────────────────────────
  const getCurrentSettings = () => ({
    provider: selectedProvider, voice: selectedVoice, model: selectedModel,
    speed, codec, sampleRate, language,
  });

  // Provider first (it resets voice/model), then explicit keys override.
  const applyPreset = (s: Record<string, unknown>) => {
    if (typeof s.provider === 'string' && voiceConfig[s.provider]) {
      handleProviderChange(s.provider);
    }
    if (typeof s.voice === 'string') setSelectedVoice(s.voice);
    if (typeof s.model === 'string') setSelectedModel(s.model);
    if (typeof s.speed === 'number') setSpeed(s.speed);
    if (typeof s.codec === 'string') setCodec(s.codec);
    if (typeof s.sampleRate === 'number') setSampleRate(s.sampleRate);
    if (typeof s.language === 'string') setLanguage(s.language);
  };

  const insertSpeechTag = (tag: typeof SPEECH_TAGS[0]) => {
    if ('tag' in tag) {
      setText(prev => prev + tag.tag);
    } else if (tag.open && tag.close) {
      setText(prev => prev + tag.open + tag.close);
    }
  };

  const handleGenerate = async (inputText?: string) => {
    const textToGenerate = inputText || text;
    if (!textToGenerate.trim()) return;
    setIsGenerating(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        text: textToGenerate.trim(),
        provider: selectedProvider,
        voice: selectedVoice,
        model: selectedModel,
      };

      if (currentConfig?.supportsSpeed && speed !== 1.0) body.speed = speed;
      if (currentConfig?.supportsCodec) {
        body.codec = codec;
        body.sample_rate = sampleRate;
        body.language = language;
      }

      const res = await fetch(apiUrl('/api/tts/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || `TTS failed (${res.status})`);
      }

      const data = await res.json();
      if (!data.audioUrl) throw new Error('No audio returned');

      const newAudio: GeneratedAudio = {
        id: `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        text: textToGenerate.trim(),
        audioUrl: data.audioUrl,
        provider: selectedProvider,
        voice: selectedVoice,
        codec: data.codec,
        timestamp: Date.now(),
      };
      setGeneratedAudio(prev => [newAudio, ...prev]);

      // Persist to artifacts for gallery
      saveArtifact({
        type: 'audio',
        url: data.audioUrl,
        prompt: textToGenerate.trim().slice(0, 200),
        provider: selectedProvider,
        metadata: { voice: selectedVoice, codec: data.codec },
      });

      if (!inputText) setText('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'TTS failed';
      setError(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBatchGenerate = async () => {
    const texts = batchTexts.filter(t => t.trim());
    if (texts.length === 0) return;
    for (const t of texts) {
      await handleGenerate(t);
    }
    setBatchTexts(['']);
  };

  const togglePlay = (audio: GeneratedAudio) => {
    if (playingId === audio.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }

    if (audioRef.current) audioRef.current.pause();
    const el = new Audio(audio.audioUrl);
    el.onended = () => setPlayingId(null);
    el.play();
    audioRef.current = el;
    setPlayingId(audio.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const noProviders = Object.keys(voiceConfig).length === 0;

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
              <p className="eyebrow mb-2">NO TTS PROVIDERS</p>
              <p className="text-sm">Loading voice configuration...</p>
            </div>
          </div>
        ) : generatedAudio.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
            <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center',
              themeName === 'nebula' ? 'bg-indigo-900/20' : themeName === 'slate' ? 'bg-teal-900/20' : 'bg-amber-900/20',
            )}>
              <AudioLines className="w-8 h-8" />
            </div>
            <div className="text-center">
              <p className="eyebrow mb-2">TEXT TO SPEECH</p>
              <p className="text-sm">Enter text to convert to speech</p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                Using {selectedProvider}, voice: {selectedVoice}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl mx-auto">
            <AnimatePresence>
              {generatedAudio.map(audio => (
                <motion.div
                  key={audio.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 p-3 rounded-xl border border-border bg-card"
                >
                  <button
                    onClick={() => togglePlay(audio)}
                    className={cn(
                      'h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition-colors',
                      playingId === audio.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80',
                    )}
                  >
                    {playingId === audio.id ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4 ml-0.5" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm line-clamp-2">{audio.text}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-muted-foreground/60">{audio.provider}</span>
                      <span className="text-[10px] text-muted-foreground/40">{audio.voice}</span>
                      {audio.codec && <span className="text-[10px] text-muted-foreground/40">{audio.codec}</span>}
                    </div>
                  </div>
                  <a
                    href={audio.audioUrl}
                    download={`tts-${audio.voice}.${audio.codec || 'mp3'}`}
                    className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-muted-foreground" />
                  </a>
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
      <div className="border-t border-border bg-background/80 backdrop-blur-sm px-4 py-3">
        <div className="max-w-3xl mx-auto space-y-2">
          <PresetPicker feature="tts" getCurrentSettings={getCurrentSettings} onApply={applyPreset} />

          {/* Controls row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedProvider} onValueChange={handleProviderChange}>
              <SelectTrigger className="h-7 text-xs border-border/60 bg-transparent w-auto min-w-[80px]">
                <SelectValue placeholder="Provider" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(voiceConfig).map(id => (
                  <SelectItem key={id} value={id}>{id}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger className="h-7 text-xs border-border/60 bg-transparent w-auto min-w-[90px]">
                <SelectValue placeholder="Voice" />
              </SelectTrigger>
              <SelectContent>
                {voices.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {currentConfig?.models?.length ? (
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="h-7 text-xs border-border/60 bg-transparent w-auto min-w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currentConfig.models.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {/* Speed (OpenAI) */}
            {currentConfig?.supportsSpeed && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">Speed</span>
                <Slider
                  value={[speed]}
                  onValueChange={([v]) => setSpeed(v)}
                  min={0.25}
                  max={4.0}
                  step={0.25}
                  className="w-20"
                />
                <span className="text-[10px] text-muted-foreground tabular-nums w-8">{speed}x</span>
              </div>
            )}

            {/* Codec (xAI) */}
            {currentConfig?.supportsCodec && (
              <Select value={codec} onValueChange={setCodec}>
                <SelectTrigger className="h-7 text-xs border-border/60 bg-transparent w-auto min-w-[60px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CODECS.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Language (xAI) */}
            {currentConfig?.supportsCodec && (
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="h-7 text-xs border-border/60 bg-transparent w-auto min-w-[80px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => (
                    <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Batch toggle */}
            <button
              onClick={() => setBatchMode(!batchMode)}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded transition-colors',
                batchMode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              Batch
            </button>
          </div>

          {/* Speech tags (xAI) */}
          {currentConfig?.supportsSpeechTags && (
            <div className="flex items-center gap-1 flex-wrap">
              {SPEECH_TAGS.map(tag => (
                <button
                  key={tag.label}
                  onClick={() => insertSpeechTag(tag)}
                  className="px-1.5 py-0.5 text-[10px] rounded bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  {tag.label}
                </button>
              ))}
            </div>
          )}

          {/* Text input */}
          {batchMode ? (
            <div className="space-y-2">
              {batchTexts.map((bt, i) => (
                <div key={i} className="flex items-start gap-2">
                  <textarea
                    value={bt}
                    onChange={e => {
                      const next = [...batchTexts];
                      next[i] = e.target.value;
                      setBatchTexts(next);
                    }}
                    placeholder={`Text ${i + 1}...`}
                    rows={1}
                    className="flex-1 resize-none border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 rounded-lg"
                  />
                  {batchTexts.length > 1 && (
                    <button
                      onClick={() => setBatchTexts(prev => prev.filter((_, j) => j !== i))}
                      className="mt-2 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setBatchTexts(prev => [...prev, ''])}>
                  <Plus className="w-3 h-3" /> Add text
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs ml-auto"
                  disabled={isGenerating || batchTexts.every(t => !t.trim())}
                  onClick={handleBatchGenerate}
                >
                  {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Generate All'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter text to speak..."
                  rows={1}
                  disabled={isGenerating}
                  className="w-full resize-none border border-border bg-card px-4 py-3 text-[15px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all disabled:opacity-50 rounded-xl"
                />
                {text.length > 0 && (
                  <span className="absolute right-3 bottom-1 text-[10px] text-muted-foreground/40">
                    {text.length}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                disabled={!text.trim() || isGenerating}
                onClick={() => handleGenerate()}
                className="h-10 w-10 shrink-0 p-0 rounded-full"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <AudioLines className="w-4 h-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
