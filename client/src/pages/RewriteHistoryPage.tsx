import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, RefreshCw, Filter, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "all", label: "All Categories" },
  { value: "image", label: "Image Generation" },
  { value: "image_edit", label: "Image Editing" },
  { value: "video", label: "Video Generation" },
  { value: "video_edit", label: "Video Editing" },
];

const CATEGORY_COLORS: Record<string, string> = {
  image: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  image_edit: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  video: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  video_edit: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
};

export default function RewriteHistoryPage() {
  const [category, setCategory] = useState("all");
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const { data: rules, isLoading, refetch } = trpc.autoRetry.rewriteHistory.useQuery(
    { category: category === "all" ? undefined : category as "image" | "image_edit" | "video" | "video_edit" },
  );

  const copyToClipboard = (text: string, id: number) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Rewrite History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Browse successful prompt rewrites. Learn what patterns bypass moderation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px] h-9 bg-muted/50">
              <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              Loading rewrite history...
            </div>
          )}

          {!isLoading && (!rules || rules.length === 0) && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <RefreshCw className="h-10 w-10 mb-4 opacity-30" />
              <p className="text-lg font-medium">No rewrites yet</p>
              <p className="text-sm mt-1">
                Enable auto-retry on any generation page. When a prompt gets moderated, Grok will rewrite it and successful rewrites appear here.
              </p>
            </div>
          )}

          {rules && rules.map((rule: any) => (
            <Card key={rule.id} className="bg-card/50 border-border/50 hover:border-border/80 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={CATEGORY_COLORS[rule.category] || "bg-muted text-muted-foreground"}>
                      {rule.category.replace("_", " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {rule.attempts} attempt{rule.attempts !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(rule.createdAt).toLocaleDateString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4 items-start">
                  {/* Original */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-red-400 uppercase tracking-wider">Original (Rejected)</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => copyToClipboard(rule.originalPrompt, rule.id * -1)}
                      >
                        {copiedId === rule.id * -1 ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                    <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                      <p className="text-sm text-foreground/80 leading-relaxed">{rule.originalPrompt}</p>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="hidden md:flex items-center justify-center pt-6">
                    <ArrowRight className="h-5 w-5 text-green-400" />
                  </div>

                  {/* Rewritten */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-green-400 uppercase tracking-wider">Rewritten (Success)</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => copyToClipboard(rule.rewrittenPrompt, rule.id)}
                      >
                        {copiedId === rule.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                    <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                      <p className="text-sm text-foreground/80 leading-relaxed">{rule.rewrittenPrompt}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
