import { useMemo, useState } from 'react';
import { AudioLines, FolderPlus, Image as ImageIcon, LayoutGrid, Search, Share2, Star, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import CollectionPickerDialog from '@/components/CollectionPickerDialog';
import { MediaViewer, type MediaItem } from '@/components/MediaViewer';
import { useArtifacts, type ArtifactType } from '@/contexts/ArtifactContext';
import { artifactSharePath } from '@/lib/share';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

const TYPE_FILTERS: { id: ArtifactType | 'all'; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'image', label: 'Images', icon: ImageIcon },
  { id: 'video', label: 'Videos', icon: Video },
  { id: 'audio', label: 'Audio', icon: AudioLines },
];

export default function FavoritesPage() {
  const { artifacts, favorites, toggleFavorite } = useArtifacts();
  const [activeType, setActiveType] = useState<ArtifactType | 'all'>('all');
  const [query, setQuery] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [collectionArtifactId, setCollectionArtifactId] = useState<number | null>(null);
  const [collectionArtifactLabel, setCollectionArtifactLabel] = useState<string>('');

  const favoriteArtifacts = useMemo(() => {
    return artifacts.filter(artifact => favorites.has(artifact.id));
  }, [artifacts, favorites]);

  const filtered = useMemo(() => {
    let result = favoriteArtifacts;
    if (activeType !== 'all') {
      result = result.filter(artifact => artifact.type === activeType);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      result = result.filter(artifact =>
        artifact.prompt?.toLowerCase().includes(q)
        || artifact.provider?.toLowerCase().includes(q)
        || artifact.model?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [activeType, favoriteArtifacts, query]);

  const mediaItems: MediaItem[] = filtered
    .filter(artifact => ['image', 'video', 'audio'].includes(artifact.type))
    .map(artifact => ({
      type: artifact.type as 'image' | 'video' | 'audio',
      url: artifact.url,
      cachedId: artifact.serverId,
      prompt: artifact.prompt,
      metadata: { provider: artifact.provider, model: artifact.model },
    }));

  const openViewer = (artifactId: string) => {
    const mediaIndex = mediaItems.findIndex(item => item.url === filtered.find(artifact => artifact.id === artifactId)?.url);
    if (mediaIndex >= 0) {
      setViewerIndex(mediaIndex);
      setViewerOpen(true);
    }
  };

  const createShare = trpc.sharing.create.useMutation();

  // Persisted share-link record; stateless art_* fallback (still resolved
  // server-side) if the mutation fails.
  const copyShareLink = async (serverId?: number) => {
    if (!serverId) return;
    const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}`;
    try {
      const { token } = await createShare.mutateAsync({ cachedContentId: serverId });
      await navigator.clipboard.writeText(`${base}/share/${token}`);
    } catch {
      await navigator.clipboard.writeText(`${base}${artifactSharePath(serverId)}`);
    }
    toast.success('Share link copied');
  };

  return (
    <div className="flex flex-1 flex-col min-w-0">
      <div className="border-b border-border/30 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Favorites</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Quick access to starred artifacts across chat, create, and research.
            </p>
          </div>
          <div className="relative min-w-[240px] max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search favorites..."
              className="pl-9"
            />
          </div>
        </div>
      </div>

      <div className="border-b border-border/30 px-6 py-3">
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map(filter => {
            const Icon = filter.icon;
            return (
              <Button
                key={filter.id}
                variant={activeType === filter.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveType(filter.id)}
              >
                <Icon className="mr-2 h-4 w-4" />
                {filter.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
            No favorites yet. Star items from the gallery or media viewer to save them here.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map(artifact => (
              <button
                key={artifact.id}
                type="button"
                onClick={() => openViewer(artifact.id)}
                className="group overflow-hidden rounded-2xl border border-border/50 bg-card text-left transition-colors hover:border-primary/40"
              >
                <div className="relative aspect-square bg-muted/30">
                  {artifact.type === 'image' && (
                    <img src={artifact.url} alt={artifact.prompt || 'Favorite image'} className="h-full w-full object-cover" />
                  )}
                  {artifact.type === 'video' && (
                    <div className="flex h-full items-center justify-center">
                      <Video className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                  )}
                  {artifact.type === 'audio' && (
                    <div className="flex h-full items-center justify-center">
                      <AudioLines className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="absolute right-3 top-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white transition-colors',
                        artifact.isFavorite && 'text-yellow-400',
                      )}
                      onClick={e => {
                        e.stopPropagation();
                        toggleFavorite(artifact.id);
                      }}
                    >
                      <Star className={cn('h-4 w-4', artifact.isFavorite && 'fill-current')} />
                    </div>
                  </div>
                </div>
                <div className="space-y-1 p-4">
                  <p className="line-clamp-2 text-sm font-medium">
                    {artifact.prompt || 'Untitled artifact'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[artifact.type, artifact.provider, artifact.model].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="px-4 pb-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!artifact.serverId}
                      onClick={e => {
                        e.stopPropagation();
                        setCollectionArtifactId(artifact.serverId ?? null);
                        setCollectionArtifactLabel(artifact.prompt || 'artifact');
                      }}
                    >
                      <FolderPlus className="mr-2 h-4 w-4" />
                      Collect
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!artifact.serverId}
                      onClick={e => {
                        e.stopPropagation();
                        void copyShareLink(artifact.serverId);
                      }}
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      Share
                    </Button>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <MediaViewer
        items={mediaItems}
        initialIndex={viewerIndex}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
        onFavorite={item => {
          const artifact = artifacts.find(entry => entry.url === item.url);
          if (artifact) toggleFavorite(artifact.id);
        }}
        isFavorited={item => {
          const artifact = artifacts.find(entry => entry.url === item.url);
          return artifact ? favorites.has(artifact.id) : false;
        }}
      />

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
