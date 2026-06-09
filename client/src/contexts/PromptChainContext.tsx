/**
 * PromptChain context
 *
 * Stores a "pending chain" so that when a user clicks "Send to Image Edit"
 * or "Send to Video" from a generation result, the target page can pick up
 * the source URL and pre-load it.
 */
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type ChainTarget = "image_edit" | "video_gen" | "video_edit" | "tts";

type ChainPayload = {
  url: string;
  prompt?: string;
  target: ChainTarget;
};

type PromptChainContextValue = {
  pending: ChainPayload | null;
  /** Queue a URL for the target page, then navigate there */
  chain: (payload: ChainPayload) => void;
  /** Consume (and clear) the pending chain from the target page */
  consume: () => ChainPayload | null;
};

const PromptChainContext = createContext<PromptChainContextValue | null>(null);

export function PromptChainProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ChainPayload | null>(null);

  const chain = useCallback((payload: ChainPayload) => {
    setPending(payload);
  }, []);

  const consume = useCallback((): ChainPayload | null => {
    const value = pending;
    setPending(null);
    return value;
  }, [pending]);

  return (
    <PromptChainContext.Provider value={{ pending, chain, consume }}>
      {children}
    </PromptChainContext.Provider>
  );
}

export function usePromptChain() {
  const ctx = useContext(PromptChainContext);
  if (!ctx) throw new Error("usePromptChain must be used inside PromptChainProvider");
  return ctx;
}
