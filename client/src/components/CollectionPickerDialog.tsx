import { useEffect, useMemo, useState } from 'react';
import { FolderPlus, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { trpcMutate, trpcQuery } from '@/lib/trpc-fetch';

type Collection = {
  id: number;
  name: string;
  description: string | null;
};

interface Props {
  artifactId: number | null;
  artifactLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CollectionPickerDialog({
  artifactId,
  artifactLabel,
  open,
  onOpenChange,
}: Props) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const selectedCollection = useMemo(
    () => collections.find(collection => collection.id === selectedId) ?? null,
    [collections, selectedId],
  );

  const loadCollections = async () => {
    setLoading(true);
    try {
      const data = await trpcQuery<Collection[]>('collections.list');
      setCollections(data);
      setSelectedId(current => current ?? data[0]?.id ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadCollections();
  }, [open]);

  const createCollection = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const created = await trpcMutate<{ id: number }>('collections.create', {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName('');
      setDescription('');
      await loadCollections();
      setSelectedId(created.id);
      toast.success('Collection created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create collection');
    } finally {
      setCreating(false);
    }
  };

  const addToCollection = async () => {
    if (!artifactId || !selectedId) return;
    setSubmitting(true);
    try {
      await trpcMutate('collections.addItem', {
        collectionId: selectedId,
        artifactId,
      });
      toast.success('Artifact added to collection');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add artifact to collection');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add To Collection</DialogTitle>
          <DialogDescription>
            {artifactLabel ? `Link "${artifactLabel}" to an existing collection or create a new one.` : 'Link this artifact to a collection.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FolderPlus className="h-4 w-4 text-primary/70" />
              <p className="text-sm font-medium">Existing collections</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center rounded-2xl border border-border/40 p-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : collections.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/50 p-4 text-sm text-muted-foreground">
                No collections yet. Create one below first.
              </div>
            ) : (
              <div className="grid gap-2">
                {collections.map(collection => (
                  <button
                    key={collection.id}
                    type="button"
                    onClick={() => setSelectedId(collection.id)}
                    className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                      selectedId === collection.id
                        ? 'border-primary/40 bg-primary/6'
                        : 'border-border/40 hover:border-primary/25'
                    }`}
                  >
                    <p className="text-sm font-medium">{collection.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {collection.description || 'No description'}
                    </p>
                  </button>
                ))}
              </div>
            )}

            <Button
              onClick={() => void addToCollection()}
              disabled={!artifactId || !selectedCollection || submitting}
              className="w-full"
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderPlus className="mr-2 h-4 w-4" />}
              Add To {selectedCollection?.name || 'Collection'}
            </Button>
          </div>

          <div className="space-y-3 rounded-2xl border border-border/40 bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary/70" />
              <p className="text-sm font-medium">Create collection</p>
            </div>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Collection name" />
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description (optional)" />
            <Button
              variant="outline"
              onClick={() => void createCollection()}
              disabled={!name.trim() || creating}
              className="w-full"
            >
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create Collection
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
