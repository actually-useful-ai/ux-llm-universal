// ============================================================
// ImageEditPanel — Edit images with AI providers
// Upload source image, describe edit, see before/after
// ============================================================

import { useState, useMemo, useRef, useCallback } from 'react';
import { Pencil, Upload, Loader2, AlertTriangle, Download, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useProviders } from '@/contexts/ProviderContext';
import { useTheme } from '@/contexts/ThemeContext';
import { apiUrl } from '@/lib/api-base';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface EditResult {
  sourceUrl: string;
  editedUrl: string;
  prompt: string;
  provider: string;
  timestamp: number;
}

// Providers that support image editing
const EDIT_PROVIDERS = [
  { id: 'xai', name: 'xAI (Grok)', model: 'grok-imagine-image-quality' },
  { id: 'openai', name: 'OpenAI', model: 'dall-e-2' },
  { id: 'gemini', name: 'Google Gemini', model: 'gemini-2.0-flash-exp' },
];

export default function ImageEditPanel() {
  const { themeName } = useTheme();
  const { providers } = useProviders();
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [results, setResults] = useState<EditResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedProvider, setSelectedProvider] = useState('xai');
  const [selectedModel, setSelectedModel] = useState('grok-imagine-image-quality');
  const [compareIndex, setCompareIndex] = useState<number | null>(null);
  const [comparePosition, setComparePosition] = useState(50); // percentage

  // Filter to available providers
  const availableEditProviders = useMemo(() => {
    const keys = new Set(providers.map((p: any) => p.id));
    return EDIT_PROVIDERS.filter(ep => keys.has(ep.id));
  }, [providers]);

  const handleProviderChange = (id: string) => {
    setSelectedProvider(id);
    const ep = EDIT_PROVIDERS.find(p => p.id === id);
    if (ep) setSelectedModel(ep.model);
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setSourceFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      setSourceImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleEdit = async () => {
    if (!sourceImage || !prompt.trim()) return;
    setIsEditing(true);
    setError(null);

    try {
      const res = await fetch(apiUrl('/api/image/edit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          image_url: sourceImage,
          provider: selectedProvider,
          model: selectedModel,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || `Edit failed (${res.status})`);
      }

      const data = await res.json();
      const images: string[] = data.images || [];

      if (images.length === 0) throw new Error('No edited image returned');

      const newResults: EditResult[] = images.map(url => ({
        sourceUrl: sourceImage,
        editedUrl: url,
        prompt: prompt.trim(),
        provider: selectedProvider,
        timestamp: Date.now(),
      }));

      setResults(prev => [...newResults, ...prev]);
      setPrompt('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Edit failed';
      setError(msg);
    } finally {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEdit();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Results area */}
      <div className="flex-1 overflow-y-auto chat-scroll p-4">
        {!sourceImage ? (
          /* Upload zone */
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div
              className={cn(
                'w-full max-w-lg aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-all',
                isDragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border/60 hover:border-border bg-muted/20 hover:bg-muted/30',
              )}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className={cn('w-10 h-10', isDragOver ? 'text-primary' : 'text-muted-foreground/40')} />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground/70">
                  {isDragOver ? 'Drop image here' : 'Upload source image'}
                </p>
                <p className="text-xs text-muted-foreground/50 mt-1">
                  Drag and drop or click to browse
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        ) : results.length === 0 ? (
          /* Source preview */
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="relative max-w-lg w-full">
              <img src={sourceImage} alt="Source" className="w-full rounded-xl border border-border" />
              <button
                onClick={() => { setSourceImage(null); setSourceFileName(''); }}
                className="absolute top-2 right-2 px-2 py-1 text-xs bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
              >
                Change
              </button>
            </div>
            <p className="text-xs text-muted-foreground/60">{sourceFileName}</p>
          </div>
        ) : (
          /* Results grid with before/after */
          <div className="space-y-4 max-w-4xl mx-auto">
            <AnimatePresence>
              {results.map((result, i) => (
                <motion.div
                  key={result.timestamp + i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  {compareIndex === i ? (
                    /* Comparison slider */
                    <div
                      className="relative aspect-video cursor-col-resize select-none"
                      onMouseMove={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setComparePosition(((e.clientX - rect.left) / rect.width) * 100);
                      }}
                      onMouseLeave={() => setCompareIndex(null)}
                    >
                      <img src={result.editedUrl} alt="Edited" className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 overflow-hidden" style={{ width: `${comparePosition}%` }}>
                        <img src={result.sourceUrl} alt="Original" className="w-full h-full object-cover" style={{ width: `${10000 / comparePosition}%`, maxWidth: 'none' }} />
                      </div>
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-white/80 shadow-lg"
                        style={{ left: `${comparePosition}%` }}
                      >
                        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center">
                          <span className="text-[10px] font-bold text-black/60">&#8596;</span>
                        </div>
                      </div>
                      <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/50 text-white text-[10px] rounded">Original</div>
                      <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/50 text-white text-[10px] rounded">Edited</div>
                    </div>
                  ) : (
                    /* Side by side */
                    <div className="grid grid-cols-2 gap-px bg-border">
                      <div className="relative bg-card">
                        <img src={result.sourceUrl} alt="Original" className="w-full aspect-video object-cover" />
                        <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/50 text-white text-[10px] rounded">Original</span>
                      </div>
                      <div className="relative bg-card group">
                        <img src={result.editedUrl} alt="Edited" className="w-full aspect-video object-cover" />
                        <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/50 text-white text-[10px] rounded">Edited</span>
                        <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setCompareIndex(i)}
                            className="h-7 px-2 flex items-center gap-1 rounded-lg bg-black/50 hover:bg-black/70 text-white text-[10px] transition-colors"
                          >
                            Compare
                          </button>
                          <a
                            href={result.editedUrl}
                            download
                            className="h-7 w-7 flex items-center justify-center rounded-lg bg-black/50 hover:bg-black/70 text-white transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="px-3 py-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground line-clamp-1">{result.prompt}</p>
                    <span className="text-[10px] text-muted-foreground/50">{result.provider}</span>
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
      {sourceImage && (
        <div className="border-t border-border bg-background/80 backdrop-blur-sm px-4 py-3">
          <div className="max-w-3xl mx-auto space-y-2">
            <div className="flex items-center gap-2">
              <Select value={selectedProvider} onValueChange={handleProviderChange}>
                <SelectTrigger className="h-7 text-xs border-border/60 bg-transparent w-auto min-w-[100px]">
                  <SelectValue placeholder="Provider" />
                </SelectTrigger>
                <SelectContent>
                  {availableEditProviders.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Small source preview */}
              <div className="flex items-center gap-1.5 ml-auto">
                <img src={sourceImage} alt="" className="w-6 h-6 rounded object-cover border border-border/50" />
                <button
                  onClick={() => { setSourceImage(null); setSourceFileName(''); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Change image
                </button>
              </div>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe the edit you want to make..."
                  rows={1}
                  disabled={isEditing}
                  className="w-full resize-none border border-border bg-card px-4 py-3 text-[15px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all disabled:opacity-50 rounded-xl"
                />
              </div>
              <Button
                size="sm"
                disabled={!prompt.trim() || isEditing}
                onClick={handleEdit}
                className="h-10 w-10 shrink-0 p-0 rounded-full"
              >
                {isEditing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Pencil className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
