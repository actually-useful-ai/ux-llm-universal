import { cn } from "@/lib/utils";

export type Provider = "xai" | "openai" | "gemini" | "runware";

interface ProviderConfig {
  id: Provider;
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "xai",
    label: "xAI Grok",
    shortLabel: "xAI",
    color: "text-white",
    bgColor: "bg-zinc-900",
    borderColor: "border-zinc-600",
    description: "Grok Imagine (Quality / Basic)",
  },
  {
    id: "openai",
    label: "OpenAI",
    shortLabel: "OpenAI",
    color: "text-white",
    bgColor: "bg-emerald-900",
    borderColor: "border-emerald-600",
    description: "GPT Image 2 / 1.5 / 1",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    shortLabel: "Gemini",
    color: "text-white",
    bgColor: "bg-blue-900",
    borderColor: "border-blue-600",
    description: "Imagen 4 + Nano Banana 2",
  },
  {
    id: "runware",
    label: "Runware",
    shortLabel: "Runware",
    color: "text-white",
    bgColor: "bg-purple-900",
    borderColor: "border-purple-600",
    description: "FLUX / SDXL / civitai + safety check",
  },
];

export const TTS_PROVIDERS: ProviderConfig[] = [
  {
    id: "xai",
    label: "xAI Grok",
    shortLabel: "xAI",
    color: "text-white",
    bgColor: "bg-zinc-900",
    borderColor: "border-zinc-600",
    description: "Grok TTS",
  },
  {
    id: "openai",
    label: "OpenAI",
    shortLabel: "OpenAI",
    color: "text-white",
    bgColor: "bg-emerald-900",
    borderColor: "border-emerald-600",
    description: "TTS-1 / TTS-1-HD / GPT-4o Mini",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    shortLabel: "Gemini",
    color: "text-white",
    bgColor: "bg-blue-900",
    borderColor: "border-blue-600",
    description: "Gemini 3.1 Flash TTS",
  },
];

interface ProviderSelectorProps {
  value: Provider;
  onChange: (provider: Provider) => void;
  providers?: ProviderConfig[];
  className?: string;
}

export function ProviderSelector({
  value,
  onChange,
  providers = PROVIDERS,
  className,
}: ProviderSelectorProps) {
  return (
    <div className={cn("flex gap-1.5 p-1 bg-muted/40 rounded-lg border border-border/50", className)}>
      {providers.map((p) => {
        const isActive = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            title={p.description}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 border",
              isActive
                ? `${p.bgColor} ${p.color} ${p.borderColor} shadow-sm`
                : "bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
            )}
          >
            <ProviderIcon provider={p.id} size={14} />
            <span>{p.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ProviderBadge({ provider, className }: { provider: Provider; className?: string }) {
  const config = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border",
        config.bgColor,
        config.color,
        config.borderColor,
        className
      )}
    >
      <ProviderIcon provider={provider} size={10} />
      {config.shortLabel}
    </span>
  );
}

export function ProviderIcon({ provider, size = 16 }: { provider: Provider; size?: number }) {
  if (provider === "openai") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0L4.1 14.518A4.5 4.5 0 0 1 2.34 7.896zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.724 2.726a4.5 4.5 0 0 1-.676 8.123v-5.678a.79.79 0 0 0-.4-.62zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.718-2.724a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
      </svg>
    );
  }
  if (provider === "gemini") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.9994 0C11.9994 6.627 6.6264 12 -0.0006 12C6.6264 12 11.9994 17.373 11.9994 24C11.9994 17.373 17.3724 12 23.9994 12C17.3724 12 11.9994 6.627 11.9994 0Z" />
      </svg>
    );
  }
  // xAI - simple X icon
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.713 5.867zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
