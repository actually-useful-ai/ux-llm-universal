import { useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import { AlertCircle, Download, Image as ImageIcon, Loader2, Share2, Video, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiUrl } from '@/lib/api-base';
import { downloadMedia } from '@/lib/download';
import { toast } from 'sonner';

type SharedArtifact = {
  viewCount: number;
  sharedAt: string;
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

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token || '';
  const [data, setData] = useState<SharedArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiUrl(`/api/share/${token}`));
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.error || 'Share not found');
        }
        setData(payload);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Share not found');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      void load();
    }
  }, [token]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    toast.success('Share link copied');
  };

  const handleDownload = async () => {
    if (!data?.content?.contentUrl) return;
    const ext = data.content.type === 'video' ? 'mp4' : data.content.type === 'audio' ? 'mp3' : 'png';
    await downloadMedia(data.content.contentUrl, `shared-${token}.${ext}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <AlertCircle className="h-12 w-12 text-destructive/60" />
        <div>
          <h1 className="text-xl font-semibold">Share Not Found</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error || 'This shared artifact is unavailable.'}</p>
        </div>
        <Link href="/">
          <Button variant="outline">Back to Chat</Button>
        </Link>
      </div>
    );
  }

  const content = data.content;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <Link href="/">
          <span className="cursor-pointer text-sm font-semibold text-primary">Universal Chat</span>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void handleCopy()}>
            <Share2 className="mr-2 h-4 w-4" />
            Copy link
          </Button>
          <Button size="sm" onClick={() => void handleDownload()}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <div className="w-full max-w-4xl overflow-hidden rounded-2xl border bg-card shadow-sm">
          {content.type === 'image' ? (
            <img src={content.contentUrl} alt={content.prompt || 'Shared artifact'} className="max-h-[70vh] w-full object-contain" />
          ) : content.type === 'video' ? (
            <video src={content.contentUrl} controls className="max-h-[70vh] w-full bg-black object-contain" />
          ) : content.type === 'audio' ? (
            <div className="flex flex-col items-center justify-center gap-4 p-12">
              <Volume2 className="h-14 w-14 text-muted-foreground/40" />
              <audio controls className="w-full max-w-xl" src={content.contentUrl} />
            </div>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center bg-muted/20">
              {content.type === 'report' ? <ImageIcon className="h-12 w-12 text-muted-foreground/30" /> : <Video className="h-12 w-12 text-muted-foreground/30" />}
            </div>
          )}
        </div>

        <div className="w-full max-w-4xl">
          <h1 className="text-lg font-semibold">{content.title || 'Shared Artifact'}</h1>
          {content.prompt ? (
            <p className="mt-2 rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              {content.prompt}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-muted-foreground">
            {[content.type, content.provider, content.model].filter(Boolean).join(' · ')}
          </p>
        </div>
      </main>
    </div>
  );
}
