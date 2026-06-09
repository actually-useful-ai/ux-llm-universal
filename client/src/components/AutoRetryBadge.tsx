import { Sparkles, RefreshCw } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AutoRetryBadgeProps {
  wasRewritten: boolean;
  originalPrompt: string;
  finalPrompt: string;
  totalAttempts: number;
  attempts?: Array<{ prompt: string; error?: string }>;
}

export function AutoRetryBadge({
  wasRewritten,
  originalPrompt,
  finalPrompt,
  totalAttempts,
  attempts,
}: AutoRetryBadgeProps) {
  if (!wasRewritten) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs cursor-help">
          <Sparkles className="h-3 w-3" />
          Auto-rewritten
          <span className="text-amber-500/60">
            ({totalAttempts} {totalAttempts === 1 ? "attempt" : "attempts"})
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        className="max-w-sm bg-zinc-800 border-zinc-700 text-zinc-200"
      >
        <div className="space-y-2 text-xs">
          <div>
            <span className="text-zinc-500">Original:</span>
            <p className="text-zinc-300 mt-0.5">{originalPrompt}</p>
          </div>
          <div>
            <span className="text-emerald-400">Final (accepted):</span>
            <p className="text-zinc-300 mt-0.5">{finalPrompt}</p>
          </div>
          {attempts && attempts.length > 0 && (
            <div>
              <span className="text-zinc-500">Retry log:</span>
              {attempts.map((a, i) => (
                <div key={i} className="mt-1 pl-2 border-l border-zinc-700">
                  <p className="text-zinc-400">#{i + 1}: "{a.prompt}"</p>
                  {a.error && (
                    <p className="text-red-400/70 text-[10px] mt-0.5">
                      {a.error.slice(0, 100)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Small toggle for enabling/disabling auto-retry.
 */
export function AutoRetryToggle({
  enabled,
  onToggle,
  maxRetries,
  onMaxRetriesChange,
}: {
  enabled: boolean;
  onToggle: (v: boolean) => void;
  maxRetries: number;
  onMaxRetriesChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onToggle(!enabled)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${
          enabled
            ? "bg-amber-500/10 border border-amber-500/30 text-amber-400"
            : "bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-zinc-400"
        }`}
      >
        <RefreshCw className="h-3 w-3" />
        Auto-retry
      </button>
      {enabled && (
        <select
          value={maxRetries}
          onChange={(e) => onMaxRetriesChange(Number(e.target.value))}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-1.5 py-1"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}x
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
