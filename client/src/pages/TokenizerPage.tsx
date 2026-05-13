import { useMemo, useState } from 'react';
import { Hash, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useProviders } from '@/contexts/ProviderContext';
import { apiUrl } from '@/lib/api-base';
import { toast } from 'sonner';

type TokenizeResult = {
  token_count?: number;
  tokens?: Array<string | { text?: string; token?: string; id?: string | number }>;
};

export default function TokenizerPage() {
  const { providers } = useProviders();
  const [text, setText] = useState('');
  const [model, setModel] = useState('grok-4.3');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TokenizeResult | null>(null);

  const modelOptions = useMemo(() => {
    const unique = new Set<string>();
    providers.forEach(provider => {
      provider.models.forEach(entry => unique.add(entry));
    });
    return Array.from(unique).sort();
  }, [providers]);

  const tokenize = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/tokenize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), model }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Tokenization failed (${res.status})`);
      }
      setResult(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Tokenization failed');
    } finally {
      setLoading(false);
    }
  };

  const tokenCount = result?.token_count ?? result?.tokens?.length ?? 0;

  return (
    <div className="flex flex-1 flex-col min-w-0">
      <div className="border-b border-border/30 px-6 py-4">
        <h1 className="text-lg font-semibold">Tokenizer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Inspect token counts through the canonical server without exposing provider keys.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="rounded-2xl border border-border/50 bg-card p-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
              <Textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={8}
                placeholder="Enter text to tokenize..."
              />
              <Input
                value={model}
                onChange={e => setModel(e.target.value)}
                list="tokenizer-models"
                placeholder="Model"
              />
              <Button disabled={loading || !text.trim()} onClick={tokenize}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Hash className="mr-2 h-4 w-4" />}
                Tokenize
              </Button>
            </div>
            <datalist id="tokenizer-models">
              {modelOptions.map(option => <option key={option} value={option} />)}
            </datalist>
          </div>

          {result && (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-border/50 bg-card p-4">
                  <p className="text-sm text-muted-foreground">Token count</p>
                  <p className="mt-2 text-3xl font-semibold">{tokenCount}</p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-card p-4">
                  <p className="text-sm text-muted-foreground">Characters</p>
                  <p className="mt-2 text-3xl font-semibold">{text.length}</p>
                </div>
                <div className="rounded-2xl border border-border/50 bg-card p-4">
                  <p className="text-sm text-muted-foreground">Chars / token</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {tokenCount > 0 ? (text.length / tokenCount).toFixed(1) : '0.0'}
                  </p>
                </div>
              </div>

              {result.tokens?.length ? (
                <div className="rounded-2xl border border-border/50 bg-card p-4">
                  <h2 className="text-sm font-medium">Token preview</h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {result.tokens.map((token, index) => {
                      const label = typeof token === 'string'
                        ? token
                        : token.text || token.token || String(token.id || index);
                      return (
                        <span key={`${label}-${index}`} className="rounded-full border border-border/40 bg-muted px-2.5 py-1 text-xs">
                          {label.replace(/ /g, '·')}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-border/50 bg-card p-4">
                <h2 className="text-sm font-medium">Raw response</h2>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
