/**
 * OfflineQueue context
 *
 * Stores pending generation requests in localStorage when the API is
 * rate-limited or unavailable, then processes them automatically when
 * the connection is restored.
 *
 * Supports: image generation, TTS
 * (Video generation is excluded because it requires polling and is
 *  already managed by the JobProvider.)
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { apiUrl } from "@/lib/api-base";

export type QueuedJobType = "image" | "tts";

export type QueuedJob = {
  id: string;
  type: QueuedJobType;
  createdAt: number;
  status: "pending" | "processing" | "done" | "failed";
  /** Serialised input payload for the generation request */
  payload: Record<string, unknown>;
  /** Human-readable description */
  description: string;
  /** Result URL(s) when done */
  resultUrls?: string[];
  error?: string;
};

type OfflineQueueContextValue = {
  queue: QueuedJob[];
  isOnline: boolean;
  /** Add a job to the queue (call when the API is unavailable) */
  enqueue: (job: Omit<QueuedJob, "id" | "createdAt" | "status">) => string;
  /** Remove a job from the queue */
  remove: (id: string) => void;
  /** Clear all done/failed jobs */
  clearCompleted: () => void;
  pendingCount: number;
  processingCount: number;
};

const STORAGE_KEY = "geepers-chat-offline-queue";

const OfflineQueueContext = createContext<OfflineQueueContextValue | null>(null);

function loadQueue(): QueuedJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedJob[];
    // Reset any "processing" jobs to "pending" on load (they were interrupted)
    return parsed.map(j => (j.status === "processing" ? { ...j, status: "pending" as const } : j));
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedJob[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch { /* quota exceeded */ }
}

let idCounter = 0;
function generateId() {
  return `oq-${Date.now()}-${++idCounter}`;
}

export function OfflineQueueProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedJob[]>(loadQueue);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const processingRef = useRef(false);

  // Persist queue to localStorage whenever it changes
  useEffect(() => {
    saveQueue(queue);
  }, [queue]);

  // Track online/offline status
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      toast.success("Back online — processing queued jobs...", { id: "offline-queue-online" });
    };
    const onOffline = () => {
      setIsOnline(false);
      toast.warning("You're offline — new requests will be queued", { id: "offline-queue-offline" });
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const enqueue = useCallback((job: Omit<QueuedJob, "id" | "createdAt" | "status">): string => {
    const id = generateId();
    const newJob: QueuedJob = { ...job, id, createdAt: Date.now(), status: "pending" };
    setQueue(prev => [...prev, newJob]);
    toast.info(`Queued: ${job.description}`, { description: "Will process when online" });
    return id;
  }, []);

  const remove = useCallback((id: string) => {
    setQueue(prev => prev.filter(j => j.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setQueue(prev => prev.filter(j => j.status !== "done" && j.status !== "failed"));
  }, []);

  const pendingCount = queue.filter(j => j.status === "pending").length;
  const processingCount = queue.filter(j => j.status === "processing").length;

  // Auto-process pending jobs when online
  useEffect(() => {
    if (!isOnline || processingRef.current) return;
    const pending = queue.filter(j => j.status === "pending");
    if (pending.length === 0) return;

    processingRef.current = true;

    (async () => {
      for (const job of pending) {
        setQueue(prev => prev.map(j => j.id === job.id ? { ...j, status: "processing" as const } : j));

        try {
          const endpoint = job.type === "image"
            ? apiUrl("/api/dreamer/images/generate")
            : apiUrl("/api/dreamer/speech");

          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(job.payload),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();
          const urls: string[] = [];

          if (job.type === "image" && Array.isArray(data?.data)) {
            urls.push(...data.data.map((img: { url: string }) => img.url));
          } else if (job.type === "tts" && data?.audioUrl) {
            urls.push(data.audioUrl);
          }

          setQueue(prev => prev.map(j =>
            j.id === job.id ? { ...j, status: "done" as const, resultUrls: urls } : j
          ));
          toast.success(`Queued job done: ${job.description}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          setQueue(prev => prev.map(j =>
            j.id === job.id ? { ...j, status: "failed" as const, error: message } : j
          ));
          toast.error(`Queued job failed: ${job.description}`, { description: message });
        }
      }
      processingRef.current = false;
    })();
  }, [isOnline, queue]);

  return (
    <OfflineQueueContext.Provider value={{
      queue,
      isOnline,
      enqueue,
      remove,
      clearCompleted,
      pendingCount,
      processingCount,
    }}>
      {children}
    </OfflineQueueContext.Provider>
  );
}

export function useOfflineQueue() {
  const ctx = useContext(OfflineQueueContext);
  if (!ctx) throw new Error("useOfflineQueue must be used inside OfflineQueueProvider");
  return ctx;
}
