// ============================================================
// Gallery Page — Unified artifact browser
// Route: /gallery, /gallery/collections
// ============================================================

import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  LayoutGrid, Image as ImageIcon, Video, AudioLines,
  FileText, Star, Filter, Search, FolderOpen, FolderPlus, Share2, Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import CollectionPickerDialog from '@/components/CollectionPickerDialog';
import { useArtifacts, type ArtifactType } from '@/contexts/ArtifactContext';
import { MediaViewer, type MediaItem } from '@/components/MediaViewer';
import { artifactSharePath } from '@/lib/share';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

const TYPE_FILTERS: { id: ArtifactType | 'all'; label: string; icon: typeof ImageIcon }[] = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'image', label: 'Images', icon: ImageIcon },
  { id: 'video', label: 'Videos', icon: Video },
  { id: 'audio', label: 'Audio', icon: AudioLines },
  { id: 'document', label: 'Docs', icon: FileText },
];

function GalleryContent() {
  const { artifacts, toggleFavorite, favorites } = useArtifacts();
  const [, navigate] = useLocation();
  const [activeFilter, setActiveFilter] = useState<ArtifactType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [collectionArtifactId, setCollectionArtifactId] = useState<number | null>(null);
  const [collectionArtifactLabel, setCollectionArtifactLabel] = useState<string>('');

  const createShare = trpc.sharing.create.useMutation();

  // Mint a persisted share-link record (view counts, expiry, showcase opt-in).
  // Links copied before 2026-06-10 used stateless art_* tokens; the server
  // still resolves those, and we fall back to one if the mutation fails.
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
      await navigator.clipboard.writeText(`${base}${artifactSharePath(serverId)}`);
      toast.success('Share link copied');
    }
  };

  const filtered = useMemo(() => {
    let result = artifacts;
    if (activeFilter !== 'all') {
      result = result.filter(a => a.type === activeFilter);
    }
    if (showFavoritesOnly) {
      result = result.filter(a => a.isFavorite);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(a =>
        a.prompt?.toLowerCase().includes(q) ||
        a.provider?.toLowerCase().includes(q) ||
        a.model?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [artifacts, activeFilter, showFavoritesOnly, searchQuery]);

  // Media items for viewer (images/videos/audio only)
  const mediaItems: MediaItem[] = filtered
    .filter(a => ['image', 'video', 'audio'].includes(a.type))
      .map(a => ({
        type: a.type as 'image' | 'video' | 'audio',
        url: a.url,
        prompt: a.prompt,
        cachedId: a.serverId,
        metadata: { provider: a.provider, model: a.model },
      }));

  const openViewer = (artifactIndex: number) => {
    const artifact = filtered[artifactIndex];
    if (!artifact || !['image', 'video', 'audio'].includes(artifact.type)) return;
    const mediaIndex = mediaItems.findIndex(m => m.url === artifact.url);
    if (mediaIndex >= 0) {
      setViewerIndex(mediaIndex);
      setViewerOpen(true);
    }
  };

  if (artifacts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-lg">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
            <LayoutGrid className="w-8 h-8 text-emerald-500/60" />
          </div>
          <h2 className="text-xl font-semibold text-foreground/80 mb-2">Artifact Gallery</h2>
          <p className="text-sm text-muted-foreground/60 leading-relaxed mb-4">
            Generated images, audio, documents, and research reports will appear here.
            Start creating on the Create or Research pages.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Filter bar */}
      <div className="px-6 py-3 border-b border-border/30 flex items-center gap-3 flex-wrap">
        {/* Type filters */}
        <div className="flex items-center gap-0.5 bg-muted/50 p-0.5 rounded-lg">
          {TYPE_FILTERS.map(filter => {
            const Icon = filter.icon;
            const isActive = activeFilter === filter.id;
            const count = filter.id === 'all' ? artifacts.length : artifacts.filter(a => a.type === filter.id).length;
            return (
              <button
                key={filter.id}
                onClick={() => setActiveFilter(filter.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-all rounded-md',
                  isActive ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {filter.label}
                {count > 0 && (
                  <span className="text-[10px] opacity-60">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Favorites toggle */}
        <Button
          variant={showFavoritesOnly ? 'default' : 'ghost'}
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
        >
          <Star className={cn('w-3.5 h-3.5', showFavoritesOnly && 'fill-current')} />
          Favorites
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => navigate('/gallery/collections')}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Collections
        </Button>

        {/* Search */}
        <div className="flex-1 min-w-[200px] max-w-sm ml-auto relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search artifacts..."
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Filter className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground/60">No artifacts match your filters</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <AnimatePresence>
              {filtered.map((artifact, i) => (
                <motion.div
                  key={artifact.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group relative aspect-square rounded-xl overflow-hidden border border-border/50 cursor-pointer bg-muted/30"
                  onClick={() => openViewer(i)}
                >
                  {artifact.type === 'image' && (
                    <img src={artifact.url} alt={artifact.prompt || ''} className="w-full h-full object-cover" />
                  )}
                  {artifact.type === 'video' && (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Video className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                  {artifact.type === 'audio' && (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <AudioLines className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                  {(artifact.type === 'document' || artifact.type === 'report') && (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <FileText className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex flex-col justify-between p-2">
                    <div className="flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity">
                      <Badge variant="outline" className="bg-black/50 text-white border-0 text-[10px]">
                        {artifact.type}
                      </Badge>
                      <button
                        onClick={e => { e.stopPropagation(); toggleFavorite(artifact.id); }}
                        className="h-6 w-6 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                      >
                        <Star className={cn(
                          'w-3 h-3',
                          artifact.isFavorite ? 'text-yellow-400 fill-current' : 'text-white/80'
                        )} />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (!artifact.serverId) return;
                          setCollectionArtifactId(artifact.serverId);
                          setCollectionArtifactLabel(artifact.prompt || 'artifact');
                        }}
                        className="h-6 w-6 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                        disabled={!artifact.serverId}
                      >
                        <FolderPlus className="w-3 h-3 text-white/80" />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          void copyShareLink(artifact.serverId);
                        }}
                        className="h-6 w-6 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                        disabled={!artifact.serverId}
                        aria-label="Copy share link"
                        title="Copy share link"
                      >
                        <Share2 className="w-3 h-3 text-white/80" />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          void copyShareLink(artifact.serverId, true);
                        }}
                        className="h-6 w-6 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 transition-colors"
                        disabled={!artifact.serverId}
                        aria-label="Add to public showcase"
                        title="Add to public showcase"
                      >
                        <Globe className="w-3 h-3 text-white/80" />
                      </button>
                    </div>
                    {artifact.prompt && (
                      <p className="text-white text-[11px] opacity-0 group-hover:opacity-100 transition-opacity line-clamp-2">
                        {artifact.prompt}
                      </p>
                    )}
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
        onFavorite={(item) => {
          const artifact = artifacts.find(a => a.url === item.url);
          if (artifact) toggleFavorite(artifact.id);
        }}
        isFavorited={(item) => {
          const artifact = artifacts.find(a => a.url === item.url);
          return artifact ? favorites.has(artifact.id) : false;
        }}
      />

      {filtered.length > 0 && (
        <div className="border-t border-border/30 px-6 py-3 text-xs text-muted-foreground">
          Share and collection actions are available for persisted server artifacts directly from the gallery grid.
        </div>
      )}

      <CollectionPickerDialog
        artifactId={collectionArtifactId}
        artifactLabel={collectionArtifactLabel}
        open={collectionArtifactId !== null}
        onOpenChange={open => {
          if (!open) {
            setCollectionArtifactId(null);
            setCollectionArtifactLabel('');
          }
        }}
      />
    </div>
  );
}

export default function GalleryPage() {
  return <GalleryContent />;
}
