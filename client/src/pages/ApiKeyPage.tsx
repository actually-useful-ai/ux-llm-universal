// ============================================================
// ApiKeyPage — xAI API key introspection (GET /v1/api-key)
// Ported from ux-llm-media in Stage 4 of the universal merge.
// Media called trpc.xai.apiKeyInfo; glm routes key introspection
// through the Express utility proxy (/api/xai/api-key) because it
// is utility, not generation (xaiGen carries generation only).
// ============================================================
import { apiUrl } from "@/lib/api-base";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useCallback, useEffect, useState } from "react";
import {
  Key,
  RefreshCw,
  Loader2,
  Shield,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Copy,
} from "lucide-react";

type FetchState = "loading" | "done" | "error";

export default function ApiKeyPage() {
  const [state, setState] = useState<FetchState>("loading");
  const [data, setData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch(apiUrl("/api/xai/api-key"));
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
      setData(json);
      setState("done");
      setErrorMsg(null);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Failed to fetch API key info");
      setState("error");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copyField = (value: string) => {
    navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">API Key Info</h1>
            <Badge variant="outline" className="text-xs">
              GET /v1/api-key
            </Badge>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void load()}>
            <RefreshCw className={`w-4 h-4 ${fetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4 max-w-3xl mx-auto w-full space-y-4">
        {state === "loading" ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : state === "error" ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 mx-auto text-red-400" />
              <p className="text-red-400">Failed to fetch API key info</p>
              <p className="text-sm text-muted-foreground">{errorMsg}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Status card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  Key Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {data?.name && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Name</p>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{data.name}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => copyField(data.name)}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {data?.id && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Key ID</p>
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-xs break-all">{data.id}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0"
                          onClick={() => copyField(data.id)}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                  {data?.api_key_id && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">API Key ID</p>
                      <p className="font-mono text-xs break-all">{data.api_key_id}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Status</p>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <Badge
                        variant="outline"
                        className="bg-green-500/20 text-green-400 border-green-500/30"
                      >
                        Active
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Permissions */}
            {data?.acls && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Permissions (ACLs)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {(Array.isArray(data.acls) ? data.acls : []).map(
                      (acl: string, i: number) => (
                        <Badge key={i} variant="outline">
                          {acl}
                        </Badge>
                      )
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Timestamps */}
            {(data?.create_time || data?.modify_time) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Timestamps
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {data.create_time && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Created</p>
                        <p>{new Date(data.create_time).toLocaleString()}</p>
                      </div>
                    )}
                    {data.modify_time && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Last Modified</p>
                        <p>{new Date(data.modify_time).toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Team info */}
            {data?.team_id && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Team</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-mono text-xs">{data.team_id}</p>
                </CardContent>
              </Card>
            )}

            {/* Raw response */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Raw Response</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono bg-muted/50 rounded p-3 overflow-x-auto max-h-64 overflow-y-auto">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
