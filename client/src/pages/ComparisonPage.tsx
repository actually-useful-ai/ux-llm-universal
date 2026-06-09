// ============================================================
// ComparisonPage — Side-by-side provider comparison at /compare
// Stage 4 of the universal merge. Media shipped its own
// ProviderComparison component (tRPC xai/openai/gemini routers);
// glm already has the richer ProviderComparePanel driven by live
// provider discovery + the dreamer-proxy /api/image/generate
// route, so the standalone page wraps that instead (single
// generation path per provider — no dual-path hazard).
// ============================================================
import ProviderComparePanel from "@/components/ProviderComparePanel";

export default function ComparisonPage() {
  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
      <ProviderComparePanel />
    </div>
  );
}
