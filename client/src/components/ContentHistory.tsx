import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import {
  Download,
  Trash2,
  History,
  Loader2,
  X,
  PackageOpen,
} from "lucide-react";
import { toast } from "sonner";

type ContentType = "chat" | "image" | "image_edit" | "video" | "video_edit" | "tts";

type ContentHistoryProps = {
  type: ContentType;
  open: boolean;
  onClose: () => void;
  onRestore?: (item: any) => void;
  renderItem: (item: any) => React.ReactNode;
};

export default function ContentHistory({
  type,
  open,
  onClose,
  onRestore,
  renderItem,
}: ContentHistoryProps) {
  const utils = trpc.useUtils();

  const historyQuery = trpc.cache.list.useQuery(
    { type, limit: 100 },
    { enabled: open }
  );

  const deleteMutation = trpc.cache.delete.useMutation({
    onSuccess: () => {
      utils.cache.list.invalidate({ type });
      toast.success("Item deleted");
    },
    onError: (err) => toast.error(`Delete failed: ${err.message}`),
  });

  const clearMutation = trpc.cache.clearByType.useMutation({
    onSuccess: (data) => {
      utils.cache.list.invalidate({ type });
      toast.success(`Cleared ${data.deleted} items`);
    },
    onError: (err) => toast.error(`Clear failed: ${err.message}`),
  });

  const items = historyQuery.data ?? [];

  const handleDownloadSingle = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error("Download failed");
    }
  };

  const handleDownloadAll = async () => {
    const downloadable = items.filter((item: any) => item.contentUrl);
    if (downloadable.length === 0) {
      toast.info("No downloadable content");
      return;
    }

    toast.info(`Downloading ${downloadable.length} items...`);

    for (const item of downloadable) {
      const url = item.contentUrl as string;
      const ext = getExtension(url, type);
      const filename = `grok-${type}-${item.id}.${ext}`;
      await handleDownloadSingle(url, filename);
      // Small delay between downloads
      await new Promise(r => setTimeout(r, 300));
    }

    toast.success(`Downloaded ${downloadable.length} items`);
  };

  const handleExportChat = (item: any) => {
    const messages = item.metadata?.messages || [];
    let markdown = `# ${item.title || "Chat Conversation"}\n\n`;
    markdown += `*Model: ${item.model || "Unknown"}*\n`;
    markdown += `*Date: ${new Date(item.createdAt).toLocaleString()}*\n\n---\n\n`;

    for (const msg of messages) {
      if (msg.role === "system") continue;
      const role = msg.role === "user" ? "**You**" : "**Grok**";
      const content = typeof msg.content === "string" ? msg.content : "[multimodal content]";
      markdown += `${role}:\n\n${content}\n\n---\n\n`;
    }

    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${item.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative ml-auto w-full max-w-md bg-background border-l flex flex-col h-full animate-in slide-in-from-right-full duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">History</h2>
            {items.length > 0 && (
              <span className="text-xs text-muted-foreground">({items.length})</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {items.length > 0 && items.some((i: any) => i.contentUrl) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleDownloadAll}
              >
                <Download className="h-3 w-3" />
                Download All
              </Button>
            )}
            {items.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all history?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {items.length} cached items of this type. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => clearMutation.mutate({ type })}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {clearMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Clear All"
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {historyQuery.isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center space-y-2">
                <PackageOpen className="h-12 w-12 mx-auto opacity-20" />
                <p className="text-sm">No history yet</p>
                <p className="text-xs">Generated content will appear here</p>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="p-3 space-y-2">
                {items.map((item: any) => (
                  <div
                    key={item.id}
                    className="rounded-lg border bg-card p-3 group hover:bg-accent/30 transition-colors"
                  >
                    {renderItem(item)}

                    {/* Actions */}
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
                      <span className="text-[10px] text-muted-foreground flex-1">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>

                      {onRestore && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                          onClick={() => {
                            onRestore(item);
                            onClose();
                          }}
                        >
                          Restore
                        </Button>
                      )}

                      {item.contentUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            const url = item.contentUrl as string;
                            const ext = getExtension(url, type);
                            handleDownloadSingle(url, `grok-${type}-${item.id}.${ext}`);
                          }}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      )}

                      {type === "chat" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleExportChat(item)}
                          title="Export as Markdown"
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive"
                        onClick={() => deleteMutation.mutate({ id: item.id })}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}

function getExtension(url: string, type: ContentType): string {
  if (!url) return "bin";
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split(".").pop();
    if (ext && ext.length <= 5) return ext;
  } catch {}
  switch (type) {
    case "image":
    case "image_edit":
      return "png";
    case "video":
    case "video_edit":
      return "mp4";
    case "tts":
      return "mp3";
    default:
      return "bin";
  }
}
