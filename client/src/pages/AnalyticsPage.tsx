import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Loader2, TrendingUp, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { trpcQuery } from '@/lib/trpc-fetch';

type SummaryResponse = {
  features: Array<{
    feature: string;
    count: number;
    successCount: number;
    avgDuration: number | null;
  }>;
  totalRequests: number;
};

type RecentEntry = {
  id: number;
  feature: string;
  model: string | null;
  success: number;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
};

export default function AnalyticsPage() {
  const [daysBack, setDaysBack] = useState(30);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [summaryResult, recentResult] = await Promise.all([
          trpcQuery<SummaryResponse>('analytics.summary', { daysBack }),
          trpcQuery<RecentEntry[]>('analytics.recent', { limit: 20 }),
        ]);
        setSummary(summaryResult);
        setRecent(recentResult);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [daysBack]);

  const totals = useMemo(() => {
    const features = summary?.features || [];
    const success = features.reduce((sum, feature) => sum + (feature.successCount || 0), 0);
    const total = features.reduce((sum, feature) => sum + (feature.count || 0), 0);
    const avgDuration = total > 0
      ? Math.round(
          features.reduce((sum, feature) => sum + ((feature.avgDuration || 0) * feature.count), 0) / total,
        )
      : 0;

    return {
      total,
      success,
      failures: total - success,
      successRate: total > 0 ? Math.round((success / total) * 100) : 100,
      avgDuration,
    };
  }, [summary]);

  return (
    <div className="flex flex-1 flex-col min-w-0">
      <div className="border-b border-border/30 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Usage telemetry recorded by canonical artifact, research, and media flows.
            </p>
          </div>
          <div className="flex gap-2">
            {[7, 30, 90].map(days => (
              <Button
                key={days}
                variant={daysBack === days ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDaysBack(days)}
              >
                {days}d
              </Button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4" />
                Requests
              </div>
              <p className="mt-3 text-2xl font-semibold">{totals.total}</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                Success rate
              </div>
              <p className="mt-3 text-2xl font-semibold">{totals.successRate}%</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                Avg duration
              </div>
              <p className="mt-3 text-2xl font-semibold">{totals.avgDuration}ms</p>
            </div>
            <div className="rounded-2xl border border-border/50 bg-card p-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4" />
                Failures
              </div>
              <p className="mt-3 text-2xl font-semibold">{totals.failures}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_minmax(0,1fr)]">
            <div className="rounded-2xl border border-border/50 bg-card">
              <div className="border-b border-border/30 px-4 py-3">
                <h2 className="font-medium">Feature summary</h2>
              </div>
              <div className="divide-y divide-border/20">
                {(summary?.features || []).map(feature => (
                  <div key={feature.feature} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{feature.feature}</p>
                      <p className="text-xs text-muted-foreground">
                        {feature.successCount}/{feature.count} successful
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <div>{feature.count} calls</div>
                      <div>{Math.round(feature.avgDuration || 0)}ms avg</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-card">
              <div className="border-b border-border/30 px-4 py-3">
                <h2 className="font-medium">Recent activity</h2>
              </div>
              <div className="divide-y divide-border/20">
                {recent.map(entry => (
                  <div key={entry.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{entry.feature}</p>
                          <Badge variant={entry.success ? 'secondary' : 'destructive'}>
                            {entry.success ? 'success' : 'error'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[entry.model, entry.durationMs ? `${entry.durationMs}ms` : null].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {entry.errorMessage && (
                      <p className="mt-2 text-xs text-destructive">{entry.errorMessage}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
