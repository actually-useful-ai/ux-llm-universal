// ============================================================
// xAI streaming chat — raw Express SSE endpoint, lifted from
// ux-llm-media (Stage 2 of the universal merge). tRPC doesn't
// support streaming well, so this stays a plain route. Path is
// unchanged (/api/xai/chat/stream) so media's client code keeps
// working after the client-side port.
// Supports ALL chat completion parameters.
// ============================================================

import type { Express } from "express";
import { ENV } from "./_core/env";

export function registerXaiChatStream(app: Express) {
  app.post("/api/xai/chat/stream", async (req, res) => {
    const {
      messages,
      model,
      temperature,
      top_p,
      max_tokens,
      frequency_penalty,
      presence_penalty,
      stop,
      seed,
      n,
      logprobs,
      top_logprobs,
      search,
      reasoning,
      response_format,
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    const body: Record<string, unknown> = {
      model: model || "grok-4-latest",
      messages,
      stream: true,
    };
    if (temperature !== undefined) body.temperature = temperature;
    if (top_p !== undefined) body.top_p = top_p;
    if (max_tokens !== undefined) body.max_tokens = max_tokens;
    if (frequency_penalty !== undefined) body.frequency_penalty = frequency_penalty;
    if (presence_penalty !== undefined) body.presence_penalty = presence_penalty;
    if (stop !== undefined) body.stop = stop;
    if (seed !== undefined) body.seed = seed;
    if (n !== undefined && n > 1) body.n = n;
    if (logprobs) body.logprobs = logprobs;
    if (top_logprobs !== undefined) body.top_logprobs = top_logprobs;
    if (search) {
      body.search_parameters = { mode: "auto" };
    }
    if (reasoning) {
      body.reasoning = reasoning;
    }
    if (response_format) {
      body.response_format = response_format;
    }

    try {
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ENV.xaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => response.statusText);
        res.status(response.status).json({ error: errText });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const reader = response.body?.getReader();
      if (!reader) {
        res.end();
        return;
      }

      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      }

      res.end();
    } catch (error: any) {
      console.error("[Chat Stream Error]", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message });
      } else {
        res.end();
      }
    }
  });
}
