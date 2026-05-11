import { useMemo, useState } from 'react';
import { BookmarkPlus, Check, Copy, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { trpcMutate } from '@/lib/trpc-fetch';
import { toast } from 'sonner';

type Template = {
  id: string;
  name: string;
  category: 'chat' | 'image' | 'video' | 'tts' | 'research';
  prompt: string;
  tags: string[];
};

const TEMPLATES: Template[] = [
  {
    id: 'chat-analyst',
    name: 'Research Analyst',
    category: 'chat',
    prompt: 'You are a meticulous research analyst. Synthesize multiple viewpoints, identify uncertainty, and present balanced conclusions with clearly labeled assumptions.',
    tags: ['analysis', 'research', 'balanced'],
  },
  {
    id: 'img-cinematic',
    name: 'Cinematic Portrait',
    category: 'image',
    prompt: 'A cinematic portrait of a weathered explorer at golden hour, shallow depth of field, dramatic shadows, rich film grain, realistic skin texture, 35mm look.',
    tags: ['portrait', 'cinematic', 'photo'],
  },
  {
    id: 'img-minimal',
    name: 'Swiss Minimal Poster',
    category: 'image',
    prompt: 'A Swiss modernist poster with strong grid composition, red-black-cream palette, bold sans-serif typography, geometric abstraction, museum-quality print texture.',
    tags: ['poster', 'swiss', 'graphic'],
  },
  {
    id: 'video-reveal',
    name: 'Product Reveal',
    category: 'video',
    prompt: 'A high-end product reveal with slow cinematic camera movement, reflective studio surface, precise rim lighting, dramatic atmosphere, premium commercial polish.',
    tags: ['product', 'commercial', 'motion'],
  },
  {
    id: 'tts-doc',
    name: 'Documentary Narration',
    category: 'tts',
    prompt: 'In the vast span of geological time, small shifts in climate and terrain reshape entire ecosystems, leaving behind clues that only careful observation can reveal.',
    tags: ['narration', 'documentary', 'voice'],
  },
  {
    id: 'research-brief',
    name: 'Competitive Research Brief',
    category: 'research',
    prompt: 'Compare the current product landscape, identify the strongest competitors, summarize differentiators, and call out gaps, risks, and strategic opportunities.',
    tags: ['competitive', 'market', 'research'],
  },
];

const CATEGORY_LABELS: Record<Template['category'] | 'all', string> = {
  all: 'All',
  chat: 'Chat',
  image: 'Image',
  video: 'Video',
  tts: 'TTS',
  research: 'Research',
};

export default function TemplatesPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Template['category'] | 'all'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return TEMPLATES.filter(template => {
      if (category !== 'all' && template.category !== category) {
        return false;
      }
      if (!query.trim()) return true;
      const q = query.trim().toLowerCase();
      return template.name.toLowerCase().includes(q)
        || template.prompt.toLowerCase().includes(q)
        || template.tags.some(tag => tag.includes(q));
    });
  }, [category, query]);

  const copyPrompt = async (template: Template) => {
    await navigator.clipboard.writeText(template.prompt);
    setCopiedId(template.id);
    toast.success('Prompt copied');
    setTimeout(() => setCopiedId(null), 1500);
  };

  const savePrompt = async (template: Template) => {
    await trpcMutate('prompts.save', {
      category: template.category,
      name: template.name,
      prompt: template.prompt,
    });
    toast.success('Saved to prompt library');
  };

  return (
    <div className="flex flex-1 flex-col min-w-0">
      <div className="border-b border-border/30 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">Prompt Templates</h1>
              <Badge variant="outline">{filtered.length}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Curated starter prompts for canonical chat, create, and research workflows.
            </p>
          </div>
          <div className="relative min-w-[240px] max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search templates..." className="pl-9" />
          </div>
        </div>
      </div>

      <div className="border-b border-border/30 px-6 py-3">
        <div className="flex flex-wrap gap-2">
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <Button
              key={value}
              variant={category === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategory(value as Template['category'] | 'all')}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(template => (
            <div key={template.id} className="rounded-2xl border border-border/50 bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{template.name}</h2>
                  <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {CATEGORY_LABELS[template.category]}
                  </p>
                </div>
                <Sparkles className="h-4 w-4 text-primary/70" />
              </div>

              <p className="mt-3 line-clamp-5 text-sm text-muted-foreground">
                {template.prompt}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {template.tags.map(tag => (
                  <span key={tag} className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => void copyPrompt(template)}>
                  {copiedId === template.id ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  Copy
                </Button>
                <Button size="sm" onClick={() => void savePrompt(template)}>
                  <BookmarkPlus className="mr-2 h-4 w-4" />
                  Save
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
