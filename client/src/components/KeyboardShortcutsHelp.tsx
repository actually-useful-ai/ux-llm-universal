import { useState } from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

interface ShortcutEntry {
  keys: string;
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutEntry[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Generation",
    shortcuts: [
      { keys: "G", description: "Focus prompt / start generation" },
      { keys: "Ctrl + Enter", description: "Submit / generate" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: "← →", description: "Navigate between results" },
      { keys: "Escape", description: "Close lightbox / dialog" },
    ],
  },
  {
    title: "Actions",
    shortcuts: [
      { keys: "D", description: "Download selected item" },
      { keys: "F", description: "Toggle favorite" },
      { keys: "Z", description: "Toggle zoom / lightbox" },
      { keys: "?", description: "Show keyboard shortcuts" },
    ],
  },
];

function KeyBadge({ keys }: { keys: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.split(" + ").map((k, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
          <kbd className="px-1.5 py-0.5 text-xs font-mono rounded border border-border bg-muted text-foreground">
            {k}
          </kbd>
        </span>
      ))}
    </span>
  );
}

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);

  // ? key opens this dialog
  useKeyboardShortcuts([
    {
      keys: "?",
      description: "Show keyboard shortcuts",
      handler: () => setOpen(true),
      noInputFocus: false,
    },
  ]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Keyboard shortcuts (?)"
        >
          <Keyboard className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {group.title}
              </p>
              <div className="space-y-1.5">
                {group.shortcuts.map((s) => (
                  <div key={s.keys} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-foreground">{s.description}</span>
                    <KeyBadge keys={s.keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
