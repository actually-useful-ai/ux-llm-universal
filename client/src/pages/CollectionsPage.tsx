import { useEffect, useMemo, useState } from 'react';
import { AudioLines, FolderOpen, Image as ImageIcon, Loader2, Plus, Trash2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MediaViewer, type MediaItem } from '@/components/MediaViewer';
import { trpcMutate, trpcQuery } from '@/lib/trpc-fetch';

type Collection = {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
};

type CollectionItem = {
  id: number;
  type: 'image' | 'video' | 'audio' | 'document' | 'report';
  url: string;
  prompt: string | null;
  provider: string | null;
  model: string | null;
};

function previewIcon(type: CollectionItem['type']) {
  if (type === 'video') return <Video className="h-8 w-8 text-muted-foreground/35" />;
  if (type === 'audio') return <AudioLines className="h-8 w-8 text-muted-foreground/35" />;
  return <ImageIcon className="h-8 w-8 text-muted-foreground/35" />;
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const loadCollections = async () => {
    setLoadingCollections(true);
    try {
      const next = await trpcQuery<Collection[]>('collections.list');
      setCollections(next);
      if (!selectedId && next.length > 0) {
        setSelectedId(next[0].id);
      }
    } finally {
      setLoadingCollections(false);
    }
  };

  useEffect(() => {
    void loadCollections();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setItems([]);
      return;
    }

    const loadItems = async () => {
      setLoadingItems(true);
      try {
        const next = await trpcQuery<any[]>('collections.items', { collectionId: selectedId });
        setItems(next.map(item => ({
          id: item.id,
          type: item.type,
          url: item.url,
          prompt: item.prompt,
          provider: item.provider,
          model: item.model,
        })));
      } finally {
        setLoadingItems(false);
      }
    };

    void loadItems();
  }, [selectedId]);

  const createCollection = async () => {
    if (!name.trim()) return;
    await trpcMutate('collections.create', {
      name: name.trim(),
      description: description.trim() || undefined,
    });
    setName('');
    setDescription('');
    await loadCollections();
  };

  const deleteCollection = async (id: number) => {
    await trpcMutate('collections.delete', { id });
    if (selectedId === id) {
      setSelectedId(null);
      setItems([]);
    }
    await loadCollections();
  };

  const mediaItems: MediaItem[] = useMemo(() => {
    return items
      .filter(item => ['image', 'video', 'audio'].includes(item.type))
      .map(item => ({
        type: item.type as 'image' | 'video' | 'audio',
        url: item.url,
        prompt: item.prompt || undefined,
        metadata: { provider: item.provider, model: item.model },
      }));
  }, [items]);

  const selectedCollection = collections.find(collection => collection.id === selectedId) || null;

  return (
    <div className="flex flex-1 min-w-0">
      <div className="flex w-80 shrink-0 flex-col border-r border-border/30 bg-background/50">
        <div className="border-b border-border/30 p-4">
          <h1 className="text-lg font-semibold">Collections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize persisted artifacts into reusable sets.
          </p>
        </div>

        <div className="space-y-2 border-b border-border/30 p-4">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Collection name" />
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" />
          <Button onClick={createCollection} disabled={!name.trim()}>
            <Plus className="mr-2 h-4 w-4" />
            Create collection
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-3">
            {loadingCollections ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : collections.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 p-4 text-sm text-muted-foreground">
                No collections yet.
              </div>
            ) : (
              <div className="space-y-2">
                {collections.map(collection => (
                  <button
                    key={collection.id}
                    type="button"
                    onClick={() => setSelectedId(collection.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      selectedId === collection.id
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border/40 hover:border-primary/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{collection.name}</p>
                        {collection.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {collection.description}
                          </p>
                        )}
                      </div>
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-destructive/10 hover:text-destructive"
                        onClick={e => {
                          e.stopPropagation();
                          void deleteCollection(collection.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border/30 px-6 py-4">
          <h2 className="text-lg font-semibold">
            {selectedCollection?.name || 'Collection items'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedCollection?.description || 'Artifacts linked to the selected collection.'}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!selectedId ? (
            <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
              Select a collection to view its items.
            </div>
          ) : loadingItems ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center">
              <FolderOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                This collection is empty. Existing linked artifacts will appear here once added.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
              {items.map((item, index) => (
                <button
                  key={`${item.id}-${item.url}`}
                  type="button"
                  onClick={() => {
                    setViewerIndex(index);
                    setViewerOpen(true);
                  }}
                  className="overflow-hidden rounded-2xl border border-border/50 bg-card text-left"
                >
                  <div className="aspect-square bg-muted/30">
                    {item.type === 'image' ? (
                      <img src={item.url} alt={item.prompt || 'Collection image'} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        {previewIcon(item.type)}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-2 text-sm font-medium">
                      {item.prompt || 'Untitled artifact'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[item.type, item.provider, item.model].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <MediaViewer
        items={mediaItems}
        initialIndex={viewerIndex}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </div>
  );
}
