import { useEffect, useState } from 'react';
import { Layers, Loader2, Plus, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiUrl } from '@/lib/api-base';
import { toast } from 'sonner';

type BatchRecord = {
  id: string;
  name?: string;
  status?: string;
  created_at?: number;
  completed_at?: number;
  request_counts?: {
    total?: number;
    completed?: number;
    failed?: number;
  };
};

export default function BatchesPage() {
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<BatchRecord | null>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadBatches = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/xai/batches'));
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load batches');
      const next = data?.data || data?.batches || [];
      setBatches(next);
      if (selectedBatch) {
        const refreshed = next.find((entry: BatchRecord) => entry.id === selectedBatch.id) || null;
        setSelectedBatch(refreshed);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load batches');
    } finally {
      setLoading(false);
    }
  };

  const loadBatchDetail = async (batchId: string) => {
    setLoadingDetail(true);
    try {
      const [batchRes, requestsRes, resultsRes] = await Promise.all([
        fetch(apiUrl(`/api/xai/batches/${batchId}`)),
        fetch(apiUrl(`/api/xai/batches/${batchId}/requests`)),
        fetch(apiUrl(`/api/xai/batches/${batchId}/results`)),
      ]);

      const [batchData, requestsData, resultsData] = await Promise.all([
        batchRes.json(),
        requestsRes.json(),
        resultsRes.json(),
      ]);

      if (!batchRes.ok) throw new Error(batchData?.error || 'Failed to load batch');

      setSelectedBatch(batchData);
      setRequests(requestsData?.data || requestsData?.requests || []);
      setResults(resultsData?.data || resultsData?.results || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load batch detail');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void loadBatches();
    const timer = setInterval(() => {
      void loadBatches();
      if (selectedBatch?.id) {
        void loadBatchDetail(selectedBatch.id);
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [selectedBatch?.id]);

  const createBatch = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(apiUrl('/api/xai/batches'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create batch');
      setNewName('');
      toast.success('Batch created');
      await loadBatches();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create batch');
    } finally {
      setCreating(false);
    }
  };

  const cancelBatch = async (batchId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/xai/batches/${batchId}/cancel`), { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to cancel batch');
      toast.success('Batch cancelled');
      await loadBatches();
      await loadBatchDetail(batchId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel batch');
    }
  };

  return (
    <div className="flex flex-1 min-w-0 flex-col">
      <div className="border-b border-border/30 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Batches</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Canonical view of xAI server-side batch processing from the unified chat app.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void loadBatches()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="w-full shrink-0 border-b border-border/30 p-4 lg:w-80 lg:border-b-0 lg:border-r">
          <div className="mb-4 flex gap-2">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="New batch name"
              onKeyDown={e => {
                if (e.key === 'Enter') void createBatch();
              }}
            />
            <Button disabled={creating || !newName.trim()} onClick={() => void createBatch()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>

          <ScrollArea className="h-[55vh] lg:h-[calc(100vh-240px)]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : batches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/50 p-4 text-sm text-muted-foreground">
                No batches yet.
              </div>
            ) : (
              <div className="space-y-2">
                {batches.map(batch => (
                  <button
                    key={batch.id}
                    type="button"
                    onClick={() => void loadBatchDetail(batch.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      selectedBatch?.id === batch.id
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-border/40 hover:border-primary/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{batch.name || batch.id}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {batch.status || 'unknown'}
                        </p>
                      </div>
                      <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-border/30 px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{selectedBatch?.name || 'Batch detail'}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedBatch ? `${selectedBatch.status || 'unknown'} · ${selectedBatch.id}` : 'Select a batch to inspect requests and results.'}
                </p>
              </div>
              {selectedBatch?.id ? (
                <Button variant="destructive" size="sm" onClick={() => void cancelBatch(selectedBatch.id)}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {!selectedBatch ? (
              <div className="rounded-2xl border border-dashed border-border/50 p-8 text-center text-sm text-muted-foreground">
                Choose a batch from the list to view its request and result payloads.
              </div>
            ) : loadingDetail ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-border/50 bg-card p-4">
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p className="mt-2 text-xl font-semibold">{selectedBatch.status || 'unknown'}</p>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-card p-4">
                    <p className="text-sm text-muted-foreground">Total requests</p>
                    <p className="mt-2 text-xl font-semibold">{selectedBatch.request_counts?.total || 0}</p>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-card p-4">
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <p className="mt-2 text-xl font-semibold">{selectedBatch.request_counts?.completed || 0}</p>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="rounded-2xl border border-border/50 bg-card p-4">
                    <h3 className="text-sm font-medium">Requests</h3>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                      {JSON.stringify(requests, null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-2xl border border-border/50 bg-card p-4">
                    <h3 className="text-sm font-medium">Results</h3>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">
                      {JSON.stringify(results, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
