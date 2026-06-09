import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useIsMobile } from "@/hooks/useMobile";

interface CollapsiblePanelProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  /** Default open state. On mobile defaults to false, on desktop defaults to true */
  defaultOpen?: boolean;
  /** Extra classes for the outer wrapper */
  className?: string;
  /** Badge content shown next to the title */
  badge?: ReactNode;
  /** Actions shown in the header row */
  actions?: ReactNode;
}

export function CollapsiblePanel({
  title,
  icon,
  children,
  defaultOpen,
  className = "",
  badge,
  actions,
}: CollapsiblePanelProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(() => {
    if (defaultOpen !== undefined) return defaultOpen;
    return !isMobile; // collapsed by default on mobile, open on desktop
  });

  return (
    <div className={`border-b lg:border-b-0 ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-accent/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon}
          <span className="text-xs font-medium truncate">{title}</span>
          {badge}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {actions && <div onClick={e => e.stopPropagation()}>{actions}</div>}
          {open ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </button>
      {open && (
        <div className="animate-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
