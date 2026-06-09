// ============================================================
// Media Viewer — Full-screen zoom/pan/keyboard gallery viewer
// Ported from imagine-studio with minimal modifications
// ============================================================

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { downloadMedia } from '@/lib/download';
import {
  ChevronLeft, ChevronRight, Download, Paintbrush, Star, X,
  ZoomIn, ZoomOut, RotateCcw, Info, Maximize2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export type MediaItem = {
  type: 'image' | 'video' | 'audio';
  url: string;
  title?: string;
  prompt?: string;
  revisedPrompt?: string;
  cachedId?: number;
  metadata?: Record<string, unknown>;
};

interface MediaViewerProps {
  items: MediaItem[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  onFavorite?: (item: MediaItem) => void;
  isFavorited?: (item: MediaItem) => boolean;
  onSendToEdit?: (item: MediaItem) => void;
}

export function MediaViewer({
  items, initialIndex, open, onClose, onFavorite, isFavorited, onSendToEdit,
}: MediaViewerProps) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showInfo, setShowInfo] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number; dist?: number } | null>(null);
  const swipeStart = useRef<number | null>(null);

  useEffect(() => {
    setIndex(initialIndex);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setShowInfo(false);
  }, [initialIndex, open]);

  const goTo = useCallback((newIndex: number) => {
    if (newIndex >= 0 && newIndex < items.length) {
      setIndex(newIndex);
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [items.length]);

  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);
  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const zoomIn = useCallback(() => setZoom(z => Math.min(z * 1.5, 5)), []);
  const zoomOut = useCallback(() => {
    setZoom(z => {
      const newZ = Math.max(z / 1.5, 1);
      if (newZ === 1) setPan({ x: 0, y: 0 });
      return newZ;
    });
  }, []);
  const resetZoom = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); goPrev(); break;
        case 'ArrowRight': e.preventDefault(); goNext(); break;
        case 'Escape': e.preventDefault(); onClose(); break;
        case '+': case '=': e.preventDefault(); zoomIn(); break;
        case '-': e.preventDefault(); zoomOut(); break;
        case '0': e.preventDefault(); resetZoom(); break;
        case 'i': e.preventDefault(); setShowInfo(s => !s); break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, goPrev, goNext, onClose, zoomIn, zoomOut, resetZoom]);

  // Mouse drag for panning when zoomed
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => { setIsDragging(false); }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1 && zoom > 1) {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStart.current = { ...pan };
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStart.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        dist: Math.sqrt(dx * dx + dy * dy),
      };
    }
  }, [zoom, pan]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return;
    if (e.touches.length === 1 && zoom > 1) {
      const dx = e.touches[0].clientX - touchStart.current.x;
      const dy = e.touches[0].clientY - touchStart.current.y;
      setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
    } else if (e.touches.length === 2 && touchStart.current.dist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / touchStart.current.dist;
      setZoom(z => Math.max(1, Math.min(z * scale, 5)));
      touchStart.current.dist = dist;
    }
  }, [zoom]);

  const handleTouchEnd = useCallback(() => { touchStart.current = null; }, []);

  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    if (zoom > 1 || e.touches.length !== 1) return;
    swipeStart.current = e.touches[0].clientX;
  }, [zoom]);

  const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
    if (swipeStart.current === null || zoom > 1) return;
    const diff = e.changedTouches[0].clientX - swipeStart.current;
    if (Math.abs(diff) > 60) {
      if (diff > 0) goPrev();
      else goNext();
    }
    swipeStart.current = null;
  }, [zoom, goPrev, goNext]);

  const item = items[index];
  if (!item) return null;

  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const handleDownload = async () => {
    try {
      const ext = item.type === 'video' ? 'mp4' : item.type === 'audio' ? 'mp3' : 'png';
      await downloadMedia(item.url, `media-${item.type}-${Date.now()}.${ext}`);
    } catch {
      toast.error('Failed to download file');
    }
  };

  const fav = isFavorited?.(item);

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-[100vw] max-h-[100dvh] w-screen h-[100dvh] p-0 border-0 rounded-none bg-black/95 [&>button]:hidden overflow-hidden">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-3 py-2 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-2 text-white/80 min-w-0">
            <span className="text-sm font-medium tabular-nums">{index + 1} / {items.length}</span>
            {item.title && (
              <span className="text-sm truncate max-w-[40vw] hidden sm:inline">{item.title}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {item.type === 'image' && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10" onClick={zoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10" onClick={zoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                {zoom > 1 && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10" onClick={resetZoom}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                {onSendToEdit && (
                  <Button
                    variant="ghost" size="icon"
                    className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10"
                    onClick={() => onSendToEdit(item)}
                    title="Send to Edit"
                  >
                    <Paintbrush className="h-4 w-4" />
                  </Button>
                )}
              </>
            )}
            {onFavorite && (
              <Button
                variant="ghost" size="icon"
                className={`h-8 w-8 hover:bg-white/10 ${fav ? 'text-yellow-400' : 'text-white/80 hover:text-white'}`}
                onClick={() => onFavorite(item)}
              >
                <Star className={`h-4 w-4 ${fav ? 'fill-current' : ''}`} />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className={`h-8 w-8 hover:bg-white/10 ${showInfo ? 'text-white bg-white/10' : 'text-white/80 hover:text-white'}`}
              onClick={() => setShowInfo(!showInfo)}
            >
              <Info className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Navigation arrows */}
        {hasPrev && (
          <button onClick={goPrev} className="absolute left-2 top-1/2 -translate-y-1/2 z-40 h-12 w-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-all backdrop-blur-sm">
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        {hasNext && (
          <button onClick={goNext} className="absolute right-2 top-1/2 -translate-y-1/2 z-40 h-12 w-12 flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white transition-all backdrop-blur-sm">
            <ChevronRight className="h-6 w-6" />
          </button>
        )}

        {/* Media content */}
        <div
          ref={containerRef}
          className="flex items-center justify-center w-full h-full select-none"
          style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={e => { handleTouchStart(e); handleSwipeStart(e); }}
          onTouchMove={handleTouchMove}
          onTouchEnd={e => { handleTouchEnd(); handleSwipeEnd(e); }}
        >
          {item.type === 'image' && (
            <img
              src={item.url}
              alt={item.title || 'Generated image'}
              className="max-w-full max-h-full object-contain transition-transform duration-150"
              style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }}
              draggable={false}
              onDoubleClick={() => { if (zoom > 1) resetZoom(); else zoomIn(); }}
            />
          )}
          {item.type === 'video' && (
            <video src={item.url} controls autoPlay className="max-w-full max-h-[85vh] rounded-lg" style={{ maxWidth: '90vw' }} />
          )}
          {item.type === 'audio' && (
            <div className="flex flex-col items-center gap-6 p-8">
              <div className="h-32 w-32 rounded-full bg-primary/20 flex items-center justify-center">
                <Maximize2 className="h-12 w-12 text-primary" />
              </div>
              <p className="text-white/80 text-sm text-center max-w-md">{item.title || item.prompt || 'Audio'}</p>
              <audio src={item.url} controls autoPlay className="w-full max-w-md" />
            </div>
          )}
        </div>

        {/* Info panel */}
        {showInfo && (
          <div className="absolute bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-black/90 via-black/80 to-transparent p-4 pt-12 max-h-[40vh] overflow-y-auto">
            <div className="space-y-2 text-white/80 text-sm max-w-2xl mx-auto">
              {item.prompt && (
                <div>
                  <span className="text-white/50 text-xs uppercase tracking-wider">Prompt</span>
                  <p className="mt-0.5">{item.prompt}</p>
                </div>
              )}
              {item.revisedPrompt && item.revisedPrompt !== item.prompt && (
                <div>
                  <span className="text-white/50 text-xs uppercase tracking-wider">Revised Prompt</span>
                  <p className="mt-0.5">{item.revisedPrompt}</p>
                </div>
              )}
              {item.metadata && Object.keys(item.metadata).length > 0 && (
                <div>
                  <span className="text-white/50 text-xs uppercase tracking-wider">Details</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {Object.entries(item.metadata)
                      .filter(([, v]) => v !== undefined && v !== null)
                      .map(([k, v]) => (
                        <span key={k} className="text-xs bg-white/10 px-2 py-0.5 rounded">
                          {k}: {String(v)}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Thumbnail strip */}
        {items.length > 1 && (
          <div className="absolute bottom-0 left-0 right-0 z-40 flex justify-center pb-3 px-4">
            <div className={`flex gap-1.5 overflow-x-auto max-w-[80vw] py-1.5 px-2 rounded-lg bg-black/50 backdrop-blur-sm ${showInfo ? 'mb-[30vh]' : ''} transition-all`}>
              {items.map((it, i) => (
                <button
                  key={`thumb-${i}`}
                  onClick={() => goTo(i)}
                  className={`shrink-0 rounded overflow-hidden transition-all ${
                    i === index ? 'ring-2 ring-primary opacity-100 scale-105' : 'opacity-50 hover:opacity-80'
                  }`}
                >
                  {it.type === 'image' ? (
                    <img src={it.url} alt="" className="h-10 w-10 object-cover" loading="lazy" />
                  ) : (
                    <div className="h-10 w-10 bg-zinc-800 flex items-center justify-center">
                      <span className="text-[8px] text-white/60">{it.type === 'video' ? 'VID' : 'AUD'}</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
