import { useEffect, useCallback } from "react";

export interface KeyboardShortcut {
  /** Key combination, e.g. "g", "ctrl+enter", "escape", "arrowleft" */
  keys: string;
  /** Description shown in the shortcuts help panel */
  description: string;
  /** Handler called when the shortcut fires */
  handler: () => void;
  /** If true, only fires when no input/textarea is focused */
  noInputFocus?: boolean;
  /** If true, fires even when a modal is open */
  global?: boolean;
}

function parseKeys(keys: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
  const parts = keys.toLowerCase().split("+");
  return {
    ctrl: parts.includes("ctrl") || parts.includes("cmd"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    key: parts[parts.length - 1],
  };
}

function matchesShortcut(e: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
  const { ctrl, shift, alt, key } = parseKeys(shortcut.keys);

  if (ctrl !== (e.ctrlKey || e.metaKey)) return false;
  if (shift !== e.shiftKey) return false;
  if (alt !== e.altKey) return false;

  const eventKey = e.key.toLowerCase();
  if (key === "enter" && eventKey !== "enter") return false;
  if (key === "escape" && eventKey !== "escape") return false;
  if (key === "arrowleft" && eventKey !== "arrowleft") return false;
  if (key === "arrowright" && eventKey !== "arrowright") return false;
  if (key === "arrowup" && eventKey !== "arrowup") return false;
  if (key === "arrowdown" && eventKey !== "arrowdown") return false;
  if (key.length === 1 && eventKey !== key) return false;

  return true;
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    (el as HTMLElement).isContentEditable
  );
}

/**
 * Register keyboard shortcuts. Call this hook in a component to activate shortcuts
 * while that component is mounted.
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        if (!matchesShortcut(e, shortcut)) continue;

        // Skip if input is focused and shortcut requires no-input-focus
        if (shortcut.noInputFocus !== false && isInputFocused()) continue;

        e.preventDefault();
        shortcut.handler();
        break;
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

/**
 * Standard shortcuts that apply globally across all pages.
 */
export const GLOBAL_SHORTCUTS = {
  GENERATE: "g",
  SUBMIT: "ctrl+enter",
  ESCAPE: "escape",
  PREV: "arrowleft",
  NEXT: "arrowright",
  DOWNLOAD: "d",
  FAVORITE: "f",
  ZOOM: "z",
} as const;
