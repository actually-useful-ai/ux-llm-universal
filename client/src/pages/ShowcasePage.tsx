import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Share2, Star, Video, Volume2 } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/api-base';
import { toast } from 'sonner';

type ShowcaseItem = {
  id: number;
  token: string;
  content: {
    id: number;
    type: 'image' | 'video' | 'audio' | 'document' | 'report';
    contentUrl: string;
    prompt: string | null;
    model: string | null;
    provider: string | null;
    title: string | null;
  };
};

export default function ShowcasePage() {
  const [items, setItems] = useState<ShowcaseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl('/api/showcase?limit=36'));
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load showcase');
        setItems(data?.items || []);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load showcase');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const copyShareLink = async (token: string) => {
    const url = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/share/${token}`;
    await navigator.clipboard.writeText(url);
    toast.success('Share link copied');
  };

  return (
    <div className="flex flex-1 flex-col min-w-0">
      <div className="border-b border-border/30 px-6 py-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Showcase</h1>
          <Star className="h-4 w-4 text-primary/70" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Public showcase feed seeded from favorited artifacts while canonical sharing is consolidated.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
            No showcase items yet. Favorited artifacts will appear here.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {items.map(item => (
              <div key={item.id} className="overflow-hidden rounded-2xl border border-border/50 bg-card">
                <Link href={`/share/${item.token}`}>
                  <div className="group block cursor-pointer">
                    <div className="aspect-square bg-muted/30">
                      {item.content.type === 'image' ? (
                        <img src={item.content.contentUrl} alt={item.content.prompt || 'Showcase image'} className="h-full w-full object-cover" />
                      ) : item.content.type === 'video' ? (
                        <div className="flex h-full items-center justify-center">
                          <Video className="h-10 w-10 text-muted-foreground/40" />
                        </div>
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Volume2 className="h-10 w-10 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 p-4">
                      <p className="line-clamp-2 text-sm font-medium">{item.content.prompt || 'Untitled artifact'}</p>
                      <p className="text-xs text-muted-foreground">
                        {[item.content.type, item.content.provider, item.content.model].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                </Link>
                <div className="flex gap-2 px-4 pb-4">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/share/${item.token}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void copyShareLink(item.token)}>
                    <Share2 className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
