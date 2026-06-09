// ============================================================
// ShowcasePage — Public opt-in gallery over shareLinks
// Stage 4 of the universal merge: media's richer showcase
// (view counts, detail dialog, before/after slider) replaced
// glm's flat grid. Reads trpc.sharing.showcase (flat rows from
// getShowcaseItems) and builds base-path-aware share URLs.
// ============================================================
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Loader2, Share2, Image, Video, Volume2, Eye, ExternalLink } from "lucide-react";
import { ComparisonSlider } from "@/components/ComparisonSlider";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type ShowcaseItem = {
  token: string;
  viewCount: number;
  sharedAt: Date | string;
  type: string;
  title: string | null;
  prompt: string | null;
  contentUrl: string | null;
  metadata: unknown;
  model: string | null;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "") || "";

function shareUrl(token: string) {
  return `${window.location.origin}${BASE}/share/${token}`;
}

export default function ShowcasePage() {
  const [selectedItem, setSelectedItem] = useState<ShowcaseItem | null>(null);

  const showcaseQuery = trpc.sharing.showcase.useQuery(
    { limit: 48 },
    { staleTime: 60_000 }
  );

  const items = ((showcaseQuery.data || []) as unknown) as ShowcaseItem[];

  const handleCopyLink = (token: string) => {
    navigator.clipboard.writeText(shareUrl(token));
    toast.success("Share link copied!");
  };

  const handleOpenShare = (token: string) => {
    window.open(shareUrl(token), "_blank");
  };

  function getMediaType(type: string) {
    if (type === "video" || type === "video_edit") return "video";
    if (type === "tts" || type === "audio") return "audio";
    return "image";
  }

  function getMetadata(item: ShowcaseItem): { originalUrl?: string; editType?: string } {
    try {
      if (typeof item.metadata === "string") {
        return JSON.parse(item.metadata);
      }
      if (typeof item.metadata === "object" && item.metadata !== null) {
        return item.metadata as { originalUrl?: string; editType?: string };
      }
    } catch { /* ignore */ }
    return {};
  }

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-background/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-2">
          <Share2 className="h-4 w-4 text-primary" />
          <h1 className="font-semibold text-sm">Showcase</h1>
          <span className="text-xs text-muted-foreground">Community shared creations</span>
        </div>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground">{items.length} items</span>
        )}
      </div>

      {/* Grid */}
      <ScrollArea className="flex-1">
        {showcaseQuery.isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Share2 className="h-12 w-12 text-muted-foreground/20 mb-3" />
            <p className="text-sm text-muted-foreground">No showcase items yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Share your creations from the Gallery to appear here
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4">
            {items.map((item) => {
              const mediaType = getMediaType(item.type);
              const meta = getMetadata(item);
              const hasOriginal = !!meta.originalUrl && mediaType === "image";

              return (
                <div
                  key={item.token}
                  className="group relative rounded-xl overflow-hidden border bg-card cursor-pointer hover:border-primary/40 transition-all hover:shadow-md"
                  onClick={() => setSelectedItem(item)}
                >
                  {/* Thumbnail */}
                  <div className="aspect-square overflow-hidden bg-muted/20">
                    {item.contentUrl ? (
                      mediaType === "video" ? (
                        <video
                          src={item.contentUrl}
                          className="w-full h-full object-cover"
                          preload="metadata"
                          muted
                        />
                      ) : mediaType === "audio" ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <Volume2 className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      ) : (
                        <img
                          src={item.contentUrl}
                          alt={item.title ?? ""}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Image className="h-8 w-8 text-muted-foreground/20" />
                      </div>
                    )}
                  </div>

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                    {item.prompt && (
                      <p className="text-[10px] text-white/80 line-clamp-2 mb-1">{item.prompt}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-white/60 text-[10px]">
                        <Eye className="h-3 w-3" />
                        {item.viewCount}
                      </div>
                      <div className="flex gap-1">
                        {hasOriginal && (
                          <span className="text-[9px] bg-primary/80 text-white px-1.5 py-0.5 rounded-full">
                            Before/After
                          </span>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopyLink(item.token); }}
                          className="text-white/70 hover:text-white transition-colors"
                          title="Copy share link"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenShare(item.token); }}
                          className="text-white/70 hover:text-white transition-colors"
                          title="Open share page"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Type badge */}
                  <div className="absolute top-1.5 left-1.5">
                    {mediaType === "video" ? (
                      <Video className="h-3.5 w-3.5 text-white drop-shadow" />
                    ) : mediaType === "audio" ? (
                      <Volume2 className="h-3.5 w-3.5 text-white drop-shadow" />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Detail dialog */}
      {selectedItem && (() => {
        const item = selectedItem;
        const mediaType = getMediaType(item.type);
        const meta = getMetadata(item);
        const hasOriginal = !!meta.originalUrl && mediaType === "image";

        return (
          <Dialog open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-sm">{item.title || "Showcase Item"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {hasOriginal ? (
                  <ComparisonSlider
                    beforeUrl={meta.originalUrl!}
                    afterUrl={item.contentUrl!}
                    beforeLabel="Original"
                    afterLabel="Edited"
                    className="rounded-lg overflow-hidden max-h-[60vh]"
                  />
                ) : (
                  <div className="rounded-lg overflow-hidden bg-muted/20">
                    {mediaType === "video" ? (
                      <video src={item.contentUrl ?? ""} controls className="w-full max-h-[60vh]" />
                    ) : mediaType === "audio" ? (
                      <div className="flex flex-col items-center gap-3 p-8">
                        <Volume2 className="h-12 w-12 text-muted-foreground/30" />
                        <audio src={item.contentUrl ?? ""} controls className="w-full" />
                      </div>
                    ) : (
                      <img src={item.contentUrl ?? ""} alt="" className="w-full max-h-[60vh] object-contain" />
                    )}
                  </div>
                )}

                {item.prompt && (
                  <p className="text-xs text-muted-foreground italic bg-muted/30 rounded px-3 py-2">
                    "{item.prompt}"
                  </p>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    {item.model && <span>Model: {item.model}</span>}
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{item.viewCount} views</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                      onClick={() => handleCopyLink(item.token)}>
                      <Share2 className="h-3 w-3" /> Copy Link
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                      onClick={() => handleOpenShare(item.token)}>
                      <ExternalLink className="h-3 w-3" /> Open
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
