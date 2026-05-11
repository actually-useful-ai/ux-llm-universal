import { useMemo, useState } from 'react';
import { Cpu, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useProviders } from '@/contexts/ProviderContext';

export default function ModelsPage() {
  const { providers } = useProviders();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return providers.filter(provider => {
      if (!q) return true;
      return provider.name.toLowerCase().includes(q)
        || provider.id.toLowerCase().includes(q)
        || provider.capabilities.some(capability => capability.includes(q))
        || provider.models.some(model => model.toLowerCase().includes(q));
    });
  }, [providers, query]);

  return (
    <div className="flex flex-1 flex-col min-w-0">
      <div className="border-b border-border/30 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">Models</h1>
              <Badge variant="outline">{filtered.length} providers</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Provider discovery and model availability exposed by the canonical chat backend.
            </p>
          </div>
          <div className="relative min-w-[240px] max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search providers or models..." className="pl-9" />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map(provider => (
            <div key={provider.id} className="rounded-2xl border border-border/50 bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{provider.name}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{provider.id}</p>
                </div>
                <Cpu className="h-5 w-5 text-primary/70" />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {provider.capabilities.map(capability => (
                  <Badge key={capability} variant="secondary">
                    {capability}
                  </Badge>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Default chat model
                  </p>
                  <p className="mt-1 text-sm">{provider.defaultModel || 'None'}</p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Chat models
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {provider.models.slice(0, 24).map(model => (
                      <span key={model} className="rounded-full border border-border/40 px-2.5 py-1 text-xs">
                        {model}
                      </span>
                    ))}
                  </div>
                </div>

                {provider.imageGenModels?.length ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Image generation
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Default: {provider.imageGenDefault || provider.imageGenModels[0]}
                    </p>
                  </div>
                ) : null}

                {provider.videoGenModels?.length ? (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Video generation
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Default: {provider.videoGenDefault || provider.videoGenModels[0]}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
