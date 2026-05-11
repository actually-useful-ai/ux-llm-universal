import { useEffect, useState } from 'react';
import { Bot, Loader2, Play, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiUrl } from '@/lib/api-base';
import { toast } from 'sonner';

type ToolCategory = {
  name: string;
  icon: string;
  description: string;
  tools: Array<{
    name: string;
    description: string;
    parameters: unknown;
  }>;
};

type ToolRegistry = {
  categories: Record<string, ToolCategory>;
  count: number;
};

export default function ResearchToolsPage() {
  const [registry, setRegistry] = useState<ToolRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [argsText, setArgsText] = useState('{}');
  const [executionResult, setExecutionResult] = useState<string>('');
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl('/api/tools'));
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load tools');
        setRegistry(data);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load tools');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  const executeTool = async () => {
    if (!selectedTool) return;
    setExecuting(true);
    try {
      const parsedArgs = JSON.parse(argsText || '{}');
      const res = await fetch(apiUrl('/api/tools/execute'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedTool, arguments: parsedArgs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Tool execution failed');
      setExecutionResult(JSON.stringify(data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool execution failed';
      toast.error(message);
      setExecutionResult(message);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-w-0">
      <div className="border-b border-border/30 px-6 py-4">
        <h1 className="text-lg font-semibold">Research Tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Canonical catalog of remote tools available to research and tool-calling chat flows.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid flex-1 min-h-0 gap-0 xl:grid-cols-[minmax(0,1.2fr)_420px]">
          <div className="overflow-y-auto p-6">
            <div className="mb-4 text-sm text-muted-foreground">
              {registry?.count || 0} tools across {Object.keys(registry?.categories || {}).length} categories
            </div>
            <div className="space-y-6">
              {Object.entries(registry?.categories || {}).map(([module, category]) => (
                <div key={module} className="rounded-2xl border border-border/50 bg-card">
                  <div className="border-b border-border/30 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-primary/70" />
                      <h2 className="font-medium">{category.name}</h2>
                    </div>
                    {category.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
                    ) : null}
                  </div>
                  <div className="divide-y divide-border/20">
                    {category.tools.map(tool => (
                      <div key={tool.name} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{tool.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
                          </div>
                          <Button
                            variant={selectedTool === tool.name ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              setSelectedTool(tool.name);
                              setArgsText(JSON.stringify(tool.parameters ? {} : {}, null, 2));
                            }}
                          >
                            Select
                          </Button>
                        </div>
                        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-xl bg-muted/30 p-3 text-xs text-muted-foreground">
                          {JSON.stringify(tool.parameters, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border/30 p-6 xl:border-l xl:border-t-0">
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary/70" />
                <h2 className="font-medium">Execute tool</h2>
              </div>
              <div className="mt-4 space-y-3">
                <Input value={selectedTool} onChange={e => setSelectedTool(e.target.value)} placeholder="Tool name" />
                <textarea
                  value={argsText}
                  onChange={e => setArgsText(e.target.value)}
                  rows={10}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
                  placeholder='{"query":"example"}'
                />
                <Button disabled={executing || !selectedTool.trim()} onClick={() => void executeTool()}>
                  {executing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                  Run
                </Button>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border/50 bg-card p-4">
              <h3 className="text-sm font-medium">Result</h3>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {executionResult || 'Tool output will appear here.'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
