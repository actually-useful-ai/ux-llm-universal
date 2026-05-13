// ============================================================
// Dreamer API Proxy — Multi-provider LLM via dr.eamer.dev
// Routes: /api/providers, /api/dreamer/*, /api/tools/*
// Keys come from env only — never from client requests
// Provider discovery: env keys drive availability, models fetched live
// When tools are present: calls provider APIs directly for native tool calling
// ============================================================

import type { Express, Request, Response } from 'express';

// --- Default models per provider (newest as of Mar 2026) ---

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-6',
  xai: 'grok-4.3',
  openai: 'gpt-5-mini',
  gemini: 'gemini-3.1-flash-lite-preview',
  mistral: 'mistral-large-latest',
  cohere: 'command-r-plus',
  perplexity: 'sonar-pro',
  huggingface: 'Qwen/Qwen3.5-9B',
  manus: 'manus-1.6',
};

// --- Fallback models (used when live fetch fails) ---

const FALLBACK_MODELS: Record<string, string[]> = {
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  xai: ['grok-4.3', 'grok-4.20-0309-reasoning', 'grok-4.20-0309-non-reasoning', 'grok-4.20-multi-agent-0309'],
  openai: ['gpt-5-mini', 'gpt-5.4', 'gpt-4.1', 'o4-mini', 'o3'],
  gemini: ['gemini-3.1-flash-lite-preview', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-flash'],
  mistral: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
  cohere: ['command-r-plus', 'command-r', 'command-a-03-2025'],
  perplexity: ['sonar-pro', 'sonar'],
  huggingface: ['Qwen/Qwen3.5-9B', 'meta-llama/Llama-3.1-8B-Instruct', 'deepseek-ai/DeepSeek-R1', 'zai-org/GLM-5'],
  manus: ['manus-1.6', 'manus-1.6-lite', 'manus-1.6-max'],
};

const DISPLAY_NAMES: Record<string, string> = {
  anthropic: 'Anthropic (Claude)',
  xai: 'xAI (Grok)',
  openai: 'OpenAI (GPT)',
  gemini: 'Google Gemini',
  mistral: 'Mistral',
  cohere: 'Cohere',
  perplexity: 'Perplexity',
  huggingface: 'HuggingFace',
  manus: 'Manus',
};

// --- Provider capabilities ---
// What each provider can do beyond basic chat

export type ProviderCapability = 'chat' | 'image_generation' | 'video_generation' | 'vision' | 'tts' | 'stt' | 'embeddings';

const PROVIDER_CAPABILITIES: Record<string, ProviderCapability[]> = {
  ollama: ['chat', 'vision'],
  anthropic: ['chat', 'vision'],
  openai: ['chat', 'vision', 'image_generation', 'video_generation', 'tts', 'stt', 'embeddings'],
  xai: ['chat', 'vision', 'image_generation', 'video_generation', 'tts'],
  gemini: ['chat', 'vision', 'image_generation', 'tts', 'embeddings'],
  mistral: ['chat', 'vision', 'embeddings'],
  cohere: ['chat', 'embeddings'],
  perplexity: ['chat'],
  huggingface: ['chat', 'image_generation'],
  manus: ['chat'],
};

// Image generation models per provider (subset of full model list)
// dall-e-3 was retired by OpenAI on 2026-03-04; gpt-image-1 is current.
// grok-2-image and grok-imagine-image-pro retired by xAI on 2026-05-15.
const IMAGE_GEN_MODELS: Record<string, string[]> = {
  openai: ['gpt-image-1'],
  xai: ['grok-imagine-image-quality', 'grok-imagine-image'],
  gemini: ['imagen-4.0-generate-001', 'imagen-4.0-fast-generate-001', 'imagen-4.0-ultra-generate-001'],
  huggingface: ['black-forest-labs/FLUX.1-dev', 'black-forest-labs/FLUX.1-schnell', 'stabilityai/stable-diffusion-xl-base-1.0'],
};

const IMAGE_GEN_DEFAULTS: Record<string, string> = {
  openai: 'gpt-image-1',
  xai: 'grok-imagine-image-quality',
  gemini: 'imagen-4.0-generate-001',
  huggingface: 'black-forest-labs/FLUX.1-schnell',
};

// Vision-capable models per provider (models that accept images)
const VISION_MODELS: Record<string, string[]> = {
  openai: ['gpt-5-mini', 'gpt-5.4', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'],
  anthropic: ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  xai: ['grok-4.3', 'grok-4.20-0309-reasoning'],
  gemini: ['gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview', 'gemini-2.5-flash'],
  mistral: ['pixtral-large-latest', 'pixtral-12b-2409'],
  ollama: ['llava', 'llava-llama3', 'llava-phi3', 'moondream', 'bakllava'],
};

const VISION_DEFAULTS: Record<string, string> = {
  openai: 'gpt-5-mini',
  anthropic: 'claude-sonnet-4-6',
  xai: 'grok-4.3',
  gemini: 'gemini-3.1-flash-lite-preview',
  mistral: 'pixtral-large-latest',
};

// TTS models per provider
// xAI's /v1/tts API is voice-keyed (voice_id), not model-keyed; the entry
// below is a label for the picker, not a wire model id.
const TTS_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o-mini-tts', 'tts-1-hd', 'tts-1'],
  xai: ['grok-tts'],
  gemini: ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'],
};

const TTS_DEFAULTS: Record<string, string> = {
  openai: 'gpt-4o-mini-tts',
  xai: 'grok-tts',
  gemini: 'gemini-3.1-flash-tts-preview',
};

// STT models per provider
const STT_MODELS: Record<string, string[]> = {
  openai: ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'],
};

const STT_DEFAULTS: Record<string, string> = {
  openai: 'whisper-1',
};

// Video generation models per provider
const VIDEO_GEN_MODELS: Record<string, string[]> = {
  xai: ['grok-imagine-video'],
  openai: ['sora-2', 'sora-2-pro'],
};

const VIDEO_GEN_DEFAULTS: Record<string, string> = {
  xai: 'grok-imagine-video',
  openai: 'sora-2',
};

// --- Provider API endpoints for direct tool-calling ---

const PROVIDER_ENDPOINTS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  huggingface: 'https://router.huggingface.co/v1/chat/completions',
  // NOTE: manus is NOT a chat/completions provider — it uses its own task-based API
  // handled separately by manus-proxy.ts
};

// --- In-memory cache: 5-minute TTL ---

const modelCache = new Map<string, { models: string[]; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(provider: string): string[] | null {
  const entry = modelCache.get(provider);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.models;
  return null;
}

function setCache(provider: string, models: string[]) {
  modelCache.set(provider, { models, ts: Date.now() });
}

// --- Per-provider live model fetchers ---

async function fetchAnthropicModels(key: string): Promise<string[]> {
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return FALLBACK_MODELS.anthropic;
  const data = await res.json() as { data: { id: string }[] };
  const models = data.data.map(m => m.id).sort();
  return models.length > 0 ? models : FALLBACK_MODELS.anthropic;
}

async function fetchOpenAIModels(key: string): Promise<string[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return FALLBACK_MODELS.openai;
  const data = await res.json() as { data: { id: string }[] };
  const models = data.data
    .map(m => m.id)
    .filter(id => /^(gpt-|o[134])/.test(id))
    .sort();
  return models.length > 0 ? models : FALLBACK_MODELS.openai;
}

async function fetchXAIModels(key: string): Promise<string[]> {
  const res = await fetch('https://api.x.ai/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return FALLBACK_MODELS.xai;
  const data = await res.json() as { data: { id: string }[] };
  const models = data.data.map(m => m.id).sort();
  return models.length > 0 ? models : FALLBACK_MODELS.xai;
}

async function fetchGeminiModels(key: string): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) return FALLBACK_MODELS.gemini;
  const data = await res.json() as {
    models: { name: string; supportedGenerationMethods: string[] }[];
  };
  const models = data.models
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''))
    .sort();
  return models.length > 0 ? models : FALLBACK_MODELS.gemini;
}

async function fetchMistralModels(key: string): Promise<string[]> {
  const res = await fetch('https://api.mistral.ai/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return FALLBACK_MODELS.mistral;
  const data = await res.json() as { data: { id: string }[] };
  const models = data.data.map(m => m.id).sort();
  return models.length > 0 ? models : FALLBACK_MODELS.mistral;
}

async function fetchCohereModels(key: string): Promise<string[]> {
  const res = await fetch('https://api.cohere.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return FALLBACK_MODELS.cohere;
  const data = await res.json() as { models: { name: string }[] };
  const models = data.models.map(m => m.name).sort();
  return models.length > 0 ? models : FALLBACK_MODELS.cohere;
}

async function fetchHuggingFaceModels(key: string): Promise<string[]> {
  const res = await fetch('https://router.huggingface.co/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return FALLBACK_MODELS.huggingface;
  const data = await res.json() as { data: { id: string }[] };
  const models = data.data
    .map(m => m.id)
    .filter(id => !id.includes('embed') && !id.includes('whisper'))
    .sort();
  return models.length > 0 ? models : FALLBACK_MODELS.huggingface;
}

const MODEL_FETCHERS: Record<string, (key: string) => Promise<string[]>> = {
  anthropic: fetchAnthropicModels,
  openai: fetchOpenAIModels,
  xai: fetchXAIModels,
  gemini: fetchGeminiModels,
  mistral: fetchMistralModels,
  cohere: fetchCohereModels,
  huggingface: fetchHuggingFaceModels,
};

async function getModels(provider: string, key: string): Promise<string[]> {
  const cached = getCached(provider);
  if (cached) return cached;

  const fetcher = MODEL_FETCHERS[provider];
  if (!fetcher) {
    const fallback = FALLBACK_MODELS[provider] || [];
    setCache(provider, fallback);
    return fallback;
  }

  try {
    const models = await fetcher(key);
    setCache(provider, models);
    return models;
  } catch {
    const fallback = FALLBACK_MODELS[provider] || [];
    setCache(provider, fallback);
    return fallback;
  }
}

// --- Provider key map ---

function getProviderKeys(): Record<string, string> {
  return {
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    xai: process.env.XAI_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
    gemini: process.env.GEMINI_API_KEY || '',
    mistral: process.env.MISTRAL_API_KEY || '',
    cohere: process.env.COHERE_API_KEY || '',
    perplexity: process.env.PERPLEXITY_API_KEY || '',
    huggingface: process.env.HF_API_KEY || '',
    manus: process.env.MANUS_API_KEY || '',
  };
}

// ============================================================
// Tool Registry
// ============================================================

interface ToolSchema {
  name: string;
  module: string;
  schema: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: {
        type: string;
        required?: string[];
        properties: Record<string, unknown>;
      };
    };
  };
}

let toolsCache: { tools: ToolSchema[]; ts: number } | null = null;
const TOOLS_CACHE_TTL = 10 * 60 * 1000;

async function fetchToolRegistry(dreamerUrl: string, dreamerKey: string): Promise<ToolSchema[]> {
  if (toolsCache && Date.now() - toolsCache.ts < TOOLS_CACHE_TTL) {
    return toolsCache.tools;
  }
  try {
    const res = await fetch(`${dreamerUrl}/v1/tools`, {
      headers: { 'X-API-Key': dreamerKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return toolsCache?.tools || [];
    const data = await res.json() as { tools: ToolSchema[] };
    toolsCache = { tools: data.tools || [], ts: Date.now() };
    return toolsCache.tools;
  } catch {
    return toolsCache?.tools || [];
  }
}

const TOOL_CATEGORIES: Record<string, { name: string; icon: string; description: string }> = {
  archive_data: { name: 'Web Archive', icon: '📦', description: 'Wayback Machine snapshots and archiving' },
  arxiv_data: { name: 'arXiv', icon: '📄', description: 'Academic paper search and retrieval' },
  census_data: { name: 'Census', icon: '📊', description: 'US Census population and ACS data' },
  finance_data: { name: 'Finance', icon: '💰', description: 'Stock prices, forex, and crypto quotes' },
  github_data: { name: 'GitHub', icon: '🐙', description: 'Repository, code, and issue search' },
  nasa_data: { name: 'NASA', icon: '🚀', description: 'APOD, Mars photos, Earth imagery, NEOs' },
  news_data: { name: 'News', icon: '📰', description: 'Headlines, search, and news sources' },
  openlibrary_data: { name: 'Open Library', icon: '📚', description: 'Book and author search' },
  semantic_scholar_data: { name: 'Semantic Scholar', icon: '🎓', description: 'Academic paper and author search' },
  weather_data: { name: 'Weather', icon: '🌤️', description: 'Current weather, forecasts, and alerts' },
  wikipedia_data: { name: 'Wikipedia', icon: '🌐', description: 'Article search and content retrieval' },
  youtube_data: { name: 'YouTube', icon: '▶️', description: 'Video search, channel stats, playlists' },
};

// ============================================================
// Direct Provider Streaming with Tool Calling
// ============================================================

interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// Build OpenAI-compatible request body (works for OpenAI, xAI, Mistral)
function buildOpenAIBody(
  model: string,
  messages: Array<{ role: string; content: string; tool_call_id?: string; name?: string }>,
  tools: ToolDef[] | undefined,
  temperature?: number,
  maxTokens?: number,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens) body.max_tokens = maxTokens;
  return body;
}

// Stream an OpenAI-compatible SSE response, emitting our normalized events
async function streamOpenAICompatible(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>,
  res: Response,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    res.status(response.status).json({ error: `Provider error (${response.status})`, details: text });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (!response.body) {
    res.status(500).json({ error: 'No response body from provider' });
    return;
  }

  // Parse SSE and re-emit normalized events
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') {
          res.write('data: {"done":true}\n\n');
          continue;
        }
        try {
          const chunk = JSON.parse(payload);
          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          // Text content
          if (delta.content) {
            res.write(`data: ${JSON.stringify({ content: delta.content })}\n\n`);
          }

          // Tool calls
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              if (tc.function?.name) {
                // Start of a tool call
                res.write(`data: ${JSON.stringify({
                  tool_call: {
                    id: tc.id || `call_${Date.now()}`,
                    index: tc.index ?? 0,
                    name: tc.function.name,
                    arguments: tc.function.arguments || '',
                  },
                })}\n\n`);
              } else if (tc.function?.arguments) {
                // Continuation of arguments
                res.write(`data: ${JSON.stringify({
                  tool_call_delta: {
                    index: tc.index ?? 0,
                    arguments: tc.function.arguments,
                  },
                })}\n\n`);
              }
            }
          }

          // Finish reason
          if (chunk.choices?.[0]?.finish_reason === 'tool_calls') {
            res.write(`data: ${JSON.stringify({ finish_reason: 'tool_calls' })}\n\n`);
          }
        } catch { /* skip unparseable lines */ }
      }
    }
  } catch { /* client disconnected */ }
  finally {
    reader.releaseLock();
    res.end();
  }
}

// Stream Anthropic response (different format)
async function streamAnthropic(
  key: string,
  model: string,
  messages: Array<{ role: string; content: string; tool_call_id?: string; tool_use_id?: string }>,
  tools: ToolDef[] | undefined,
  systemPrompt: string | undefined,
  temperature?: number,
  maxTokens?: number,
  res?: Response,
): Promise<void> {
  if (!res) return;

  // Convert messages: Anthropic uses a different format for tool results
  const anthropicMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user' as const,
          content: [{
            type: 'tool_result' as const,
            tool_use_id: m.tool_use_id || m.tool_call_id || '',
            content: m.content,
          }],
        };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content };
    });

  // Convert tools to Anthropic format
  const anthropicTools = tools?.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  const body: Record<string, unknown> = {
    model,
    messages: anthropicMessages,
    max_tokens: maxTokens || 4096,
    stream: true,
  };
  if (systemPrompt) body.system = systemPrompt;
  if (anthropicTools && anthropicTools.length > 0) body.tools = anthropicTools;
  if (temperature !== undefined) body.temperature = temperature;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    res.status(response.status).json({ error: `Provider error (${response.status})`, details: text });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (!response.body) {
    res.status(500).json({ error: 'No response body' });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentToolId = '';
  let currentToolName = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload) continue;

        try {
          const event = JSON.parse(payload);

          switch (event.type) {
            case 'content_block_start':
              if (event.content_block?.type === 'tool_use') {
                currentToolId = event.content_block.id || `call_${Date.now()}`;
                currentToolName = event.content_block.name || '';
                res.write(`data: ${JSON.stringify({
                  tool_call: {
                    id: currentToolId,
                    index: event.index ?? 0,
                    name: currentToolName,
                    arguments: '',
                  },
                })}\n\n`);
              }
              break;

            case 'content_block_delta':
              if (event.delta?.type === 'text_delta') {
                res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
              } else if (event.delta?.type === 'input_json_delta') {
                res.write(`data: ${JSON.stringify({
                  tool_call_delta: {
                    index: event.index ?? 0,
                    arguments: event.delta.partial_json || '',
                  },
                })}\n\n`);
              }
              break;

            case 'message_delta':
              if (event.delta?.stop_reason === 'tool_use') {
                res.write(`data: ${JSON.stringify({ finish_reason: 'tool_calls' })}\n\n`);
              }
              break;

            case 'message_stop':
              res.write('data: {"done":true}\n\n');
              break;
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* client disconnected */ }
  finally {
    reader.releaseLock();
    res.end();
  }
}

// ============================================================
// Register all routes
// ============================================================

export function registerDreamerProxy(app: Express) {
  const dreamerUrl = (process.env.DREAMER_API_URL || 'http://localhost:5200').replace(/\/$/, '');
  const dreamerKey = process.env.DREAMER_API_KEY || '';

  // List available providers
  app.get('/api/providers', async (_req: Request, res: Response) => {
    const providers: Array<{
      id: string;
      name: string;
      models: string[];
      defaultModel: string;
      available: boolean;
      supportsTools: boolean;
      taskBased?: boolean;
      capabilities: ProviderCapability[];
      imageGenModels?: string[];
      imageGenDefault?: string;
      visionModels?: string[];
      visionDefault?: string;
      ttsModels?: string[];
      ttsDefault?: string;
      sttModels?: string[];
      sttDefault?: string;
      videoGenModels?: string[];
      videoGenDefault?: string;
    }> = [
      {
        id: 'ollama',
        name: 'Ollama',
        models: [],
        defaultModel: 'glm-5',
        available: true,
        supportsTools: true,
        capabilities: PROVIDER_CAPABILITIES.ollama || ['chat'],
        visionModels: VISION_MODELS.ollama,
        visionDefault: VISION_DEFAULTS.ollama,
      },
    ];

    const keys = getProviderKeys();
    const entries = Object.entries(keys).filter(([, key]) => key.length > 0);
    const results = await Promise.allSettled(
      entries.map(async ([id, key]) => {
        const models = await getModels(id, key);
        return { id, models };
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { id, models } = result.value;
        const supportsTools = ['anthropic', 'openai', 'xai', 'mistral', 'gemini', 'huggingface'].includes(id);
        const taskBased = id === 'manus';
        const capabilities = PROVIDER_CAPABILITIES[id] || ['chat'];

        const entry: (typeof providers)[number] = {
          id,
          name: DISPLAY_NAMES[id] || id,
          models,
          defaultModel: DEFAULT_MODELS[id] || models[0] || '',
          available: true,
          supportsTools,
          taskBased: taskBased || undefined,
          capabilities,
        };

        // Attach modality-specific model lists only if provider has that capability
        if (capabilities.includes('image_generation') && IMAGE_GEN_MODELS[id]) {
          entry.imageGenModels = IMAGE_GEN_MODELS[id];
          entry.imageGenDefault = IMAGE_GEN_DEFAULTS[id];
        }
        if (capabilities.includes('vision') && VISION_MODELS[id]) {
          entry.visionModels = VISION_MODELS[id];
          entry.visionDefault = VISION_DEFAULTS[id];
        }
        if (capabilities.includes('tts') && TTS_MODELS[id]) {
          entry.ttsModels = TTS_MODELS[id];
          entry.ttsDefault = TTS_DEFAULTS[id];
        }
        if (capabilities.includes('stt') && STT_MODELS[id]) {
          entry.sttModels = STT_MODELS[id];
          entry.sttDefault = STT_DEFAULTS[id];
        }
        if (capabilities.includes('video_generation') && VIDEO_GEN_MODELS[id]) {
          entry.videoGenModels = VIDEO_GEN_MODELS[id];
          entry.videoGenDefault = VIDEO_GEN_DEFAULTS[id];
        }

        providers.push(entry);
      }
    }

    res.json({ providers });
  });

  // ---- Tool Registry Endpoints ----

  app.get('/api/tools', async (_req: Request, res: Response) => {
    try {
      const tools = await fetchToolRegistry(dreamerUrl, dreamerKey);
      const categories: Record<string, {
        name: string; icon: string; description: string;
        tools: Array<{ name: string; description: string; parameters: unknown }>;
      }> = {};

      for (const tool of tools) {
        const mod = tool.module || 'other';
        if (!categories[mod]) {
          const meta = TOOL_CATEGORIES[mod] || { name: mod, icon: '🔧', description: '' };
          categories[mod] = { ...meta, tools: [] };
        }
        categories[mod].tools.push({
          name: tool.name,
          description: tool.schema?.function?.description || '',
          parameters: tool.schema?.function?.parameters || {},
        });
      }

      res.json({
        categories,
        tools: tools.map(t => ({
          name: t.name,
          module: t.module,
          description: t.schema?.function?.description || '',
          parameters: t.schema?.function?.parameters || {},
        })),
        count: tools.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch tools';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/tools/execute', async (req: Request, res: Response) => {
    const { name, arguments: args } = req.body;
    if (!name) { res.status(400).json({ error: 'Tool name is required' }); return; }
    if (!dreamerKey) { res.status(503).json({ error: 'API gateway not configured' }); return; }
    try {
      const response = await fetch(`${dreamerUrl}/v1/tools/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'X-API-Key': dreamerKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {}),
      });
      const data = await response.json();
      if (!response.ok) {
        res.status(response.status).json({ error: data.error || `Tool execution failed (${response.status})`, result: data });
        return;
      }
      res.json(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tool execution error';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/tools/schemas', async (_req: Request, res: Response) => {
    try {
      const tools = await fetchToolRegistry(dreamerUrl, dreamerKey);
      const schemas = tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.schema?.function?.description || t.name,
          parameters: t.schema?.function?.parameters || { type: 'object', properties: {} },
        },
      }));
      res.json({ tools: schemas });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch tool schemas';
      res.status(500).json({ error: msg });
    }
  });

  // ---- Streaming Chat ----

  app.post('/api/dreamer/chat/stream', async (req: Request, res: Response) => {
    const { provider, model, messages, temperature, maxTokens, systemPrompt, tools } = req.body;

    if (!provider || !messages) {
      res.status(400).json({ error: 'provider and messages are required' });
      return;
    }

    const keys = getProviderKeys();
    const providerKey = keys[provider];

    // If tools are present and provider supports direct API, use direct streaming
    const directProviders = ['anthropic', 'openai', 'xai', 'mistral', 'huggingface'];
    const hasTools = tools && tools.length > 0;
    const useDirectAPI = hasTools && directProviders.includes(provider) && providerKey;

    try {
      if (useDirectAPI) {
        // --- Direct provider API with tool calling ---
        const allMessages = systemPrompt && provider !== 'anthropic'
          ? [{ role: 'system', content: systemPrompt }, ...messages]
          : messages;

        const selectedModel = model || DEFAULT_MODELS[provider] || '';

        if (provider === 'anthropic') {
          await streamAnthropic(
            providerKey, selectedModel, allMessages, tools,
            systemPrompt, temperature, maxTokens, res,
          );
        } else {
          // OpenAI-compatible (openai, xai, mistral)
          const endpoint = PROVIDER_ENDPOINTS[provider];
          const body = buildOpenAIBody(selectedModel, allMessages, tools, temperature, maxTokens);
          const headers: Record<string, string> = { Authorization: `Bearer ${providerKey}` };
          await streamOpenAICompatible(endpoint, headers, body, res);
        }
      } else {
        // --- Fallback: use dreamer gateway (no tool calling) ---
        if (!dreamerKey) {
          res.status(503).json({ error: 'No API key configured for this provider' });
          return;
        }

        const allMessages = systemPrompt
          ? [{ role: 'system', content: systemPrompt }, ...messages]
          : messages;

        const body: Record<string, unknown> = {
          provider,
          messages: allMessages,
          stream: true,
        };
        if (model) body.model = model;
        if (temperature !== undefined) body.temperature = temperature;
        if (maxTokens) body.max_tokens = maxTokens;

        const response = await fetch(`${dreamerUrl}/v1/llm/chat`, {
          method: 'POST',
          headers: { 'X-API-Key': dreamerKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          res.status(response.status).json({ error: `Provider error (${response.status})`, details: text });
          return;
        }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        if (!response.body) {
          res.status(500).json({ error: 'No response body from provider' });
          return;
        }

        try {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(decoder.decode(value, { stream: true }));
          }
          reader.releaseLock();
        } catch {
          try {
            for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
              res.write(typeof chunk === 'string' ? chunk : Buffer.from(chunk));
            }
          } catch { /* Client disconnected */ }
        } finally {
          res.end();
        }
      }
    } catch (err) {
      if (!res.headersSent) {
        const msg = err instanceof Error ? err.message : 'Unknown proxy error';
        res.status(500).json({ error: msg });
      }
    }
  });

  // ============================================================
  // Modality Proxies — route through dr.eamer.dev API Gateway
  // Gateway handles provider auth, rate limits, multi-provider routing
  // ============================================================

  const gatewayUrl = dreamerUrl.replace(/\/+$/, '');
  const gatewayKey = dreamerKey;

  // Helper: proxy a JSON POST to the gateway
  async function gatewayPost(path: string, body: Record<string, unknown>, timeoutMs = 120000) {
    const apiRes = await fetch(`${gatewayUrl}${path}`, {
      method: 'POST',
      headers: {
        'X-API-Key': gatewayKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!apiRes.ok) {
      const errData = await apiRes.json().catch(() => ({})) as { error?: string; message?: string };
      throw new Error(errData.error || errData.message || `Gateway error: ${apiRes.status}`);
    }
    return apiRes.json();
  }

  // ---- Image Generation ----
  // Gateway: POST /v1/llm/images/generate { provider, prompt, model, size }

  app.post('/api/image/generate', async (req: Request, res: Response) => {
    const {
      prompt, provider, model, size = '1024x1024',
      quality, style, n = 1, aspect_ratio, negative_prompt, seed,
    } = req.body;

    if (!prompt || !provider || !model) {
      res.status(400).json({ error: 'prompt, provider, and model are required' });
      return;
    }

    const capabilities = PROVIDER_CAPABILITIES[provider] || [];
    if (!capabilities.includes('image_generation')) {
      res.status(400).json({ error: `Provider ${provider} does not support image generation` });
      return;
    }

    const keys = getProviderKeys();
    const apiKey = keys[provider];

    try {
      // Direct xAI call (aspect_ratio, resolution, response_format)
      if (provider === 'xai' && apiKey) {
        const body: Record<string, unknown> = {
          prompt,
          model: model || 'grok-imagine-image',
          n: Math.min(n, 10),
          response_format: 'url',
        };
        if (aspect_ratio) body.aspect_ratio = aspect_ratio;
        if (quality && quality !== 'auto') body.resolution = quality; // client sends quality, map to resolution
        if (seed != null) body.seed = seed;

        const apiRes = await fetch('https://api.x.ai/v1/images/generations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: string; message?: string };
          throw new Error(errData.error || errData.message || `xAI image error: ${apiRes.status}`);
        }

        const data = await apiRes.json() as { data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }> };
        const images = (data.data || []).map(d =>
          d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : ''),
        ).filter(Boolean);
        const revisedPrompt = data.data?.[0]?.revised_prompt;
        res.json({ images, revised_prompt: revisedPrompt });
        return;
      }

      // Direct OpenAI call — model-aware params (gpt-image-1 vs dall-e-3 vs dall-e-2)
      // gpt-image-1 is the current default; dall-e-3 was retired 2026-03-04
      // but legacy branches remain in case a caller pins the older id.
      if (provider === 'openai' && apiKey) {
        const resolvedModel = model || 'gpt-image-1';
        const isGptImage1 = resolvedModel.startsWith('gpt-image-1');
        const isDalle3 = resolvedModel === 'dall-e-3';
        const body: Record<string, unknown> = {
          prompt,
          model: resolvedModel,
          n: isDalle3 ? 1 : Math.min(n, isGptImage1 ? 10 : 4),
          size: size || '1024x1024',
        };
        if (isGptImage1) {
          // gpt-image-1: quality is low/medium/high, supports output_format and background
          body.quality = quality || 'medium';
          body.response_format = 'url';
          const { output_format, background } = req.body;
          if (output_format) body.output_format = output_format;
          if (background) body.background = background;
        } else if (isDalle3) {
          // dall-e-3: quality is standard/hd, supports style
          if (quality) body.quality = quality;
          if (style) body.style = style;
        } else {
          // dall-e-2: basic params only
          if (quality) body.quality = quality;
        }
        if (seed != null) body.seed = seed;

        const apiRes = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(errData.error?.message || `OpenAI image error: ${apiRes.status}`);
        }

        const data = await apiRes.json() as { data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }> };
        const images = (data.data || []).map(d =>
          d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : ''),
        ).filter(Boolean);
        const revisedPrompt = data.data?.[0]?.revised_prompt;
        res.json({ images, revised_prompt: revisedPrompt });
        return;
      }

      // Fallback: gateway
      const gatewayBody: Record<string, unknown> = { provider, prompt, model, size };
      if (n > 1) gatewayBody.n = n;
      if (quality) gatewayBody.quality = quality;
      if (style) gatewayBody.style = style;
      if (aspect_ratio) gatewayBody.aspect_ratio = aspect_ratio;
      if (negative_prompt) gatewayBody.negative_prompt = negative_prompt;
      if (seed != null) gatewayBody.seed = seed;

      const data = await gatewayPost('/v1/llm/images/generate', gatewayBody) as {
        image_data?: string; url?: string; images?: string[]; revised_prompt?: string;
      };

      const images: string[] = [];
      if (data.images) {
        images.push(...data.images);
      } else if (data.image_data) {
        images.push(`data:image/png;base64,${data.image_data}`);
      } else if (data.url) {
        images.push(data.url);
      }
      res.json({ images, revised_prompt: data.revised_prompt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image generation failed';
      res.status(500).json({ error: msg });
    }
  });

  // ---- Video Generation ----
  // xAI: POST https://api.x.ai/v1/videos/generations → request_id → poll
  // OpenAI Sora: POST https://api.openai.com/v1/videos → id → poll

  app.post('/api/video/generate', async (req: Request, res: Response) => {
    const {
      prompt, provider = 'xai', model, duration, resolution,
      aspect_ratio, image_url, reference_images, maxRetries = 0,
    } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }

    const keys = getProviderKeys();
    const apiKey = keys[provider];
    if (!apiKey) {
      res.status(400).json({ error: `No API key configured for ${provider}` });
      return;
    }

    try {
      if (provider === 'xai') {
        const body: Record<string, unknown> = { prompt, model: model || 'grok-imagine-video' };
        if (duration) body.duration = duration;
        if (resolution) body.resolution = resolution;
        if (aspect_ratio) body.aspect_ratio = aspect_ratio;
        if (image_url) body.image = { url: image_url, type: 'image_url' };
        if (reference_images) body.reference_images = reference_images;

        const apiRes = await fetch('https://api.x.ai/v1/videos/generations', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: string; message?: string };
          throw new Error(errData.error || errData.message || `xAI video error: ${apiRes.status}`);
        }

        const data = await apiRes.json() as { request_id?: string };
        res.json({ requestId: data.request_id, provider: 'xai' });
      } else if (provider === 'openai') {
        const { size: videoSize, seconds } = req.body;
        const body: Record<string, unknown> = {
          prompt,
          model: model || 'sora-2',
          n: 1,
        };
        if (seconds) body.seconds = String(seconds);
        else if (duration) body.seconds = String(duration); // back-compat
        if (videoSize) body.size = videoSize;

        const apiRes = await fetch('https://api.openai.com/v1/videos', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(errData.error?.message || `OpenAI video error: ${apiRes.status}`);
        }

        const data = await apiRes.json() as { id?: string };
        res.json({ requestId: data.id, provider: 'openai' });
      } else {
        res.status(400).json({ error: `Video generation not supported for provider: ${provider}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video generation failed';
      res.status(500).json({ error: msg });
    }
  });

  // ---- Video Status Polling ----

  app.get('/api/video/status', async (req: Request, res: Response) => {
    const requestId = req.query.requestId as string;
    const provider = (req.query.provider as string) || 'xai';

    if (!requestId) {
      res.status(400).json({ error: 'requestId is required' });
      return;
    }

    const keys = getProviderKeys();
    const apiKey = keys[provider];
    if (!apiKey) {
      res.status(400).json({ error: `No API key for ${provider}` });
      return;
    }

    try {
      if (provider === 'xai') {
        const apiRes = await fetch(`https://api.x.ai/v1/videos/${encodeURIComponent(requestId)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (apiRes.status === 202) {
          res.json({ status: 'pending', requestId });
          return;
        }

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error || `Status check failed: ${apiRes.status}`);
        }

        const data = await apiRes.json() as {
          status?: string; // "pending" | "done" | "expired"
          video?: { url?: string; duration?: number };
          error?: string;
        };

        if (data.status === 'done' && data.video?.url) {
          res.json({
            status: 'done',
            video: { url: data.video.url },
            requestId,
          });
        } else if (data.status === 'expired' || data.status === 'failed' || data.error) {
          res.json({
            status: 'failed',
            error: data.error || `Video ${data.status || 'failed'}`,
            requestId,
          });
        } else {
          // pending or unknown → still processing
          res.json({ status: 'pending', requestId });
        }
      } else if (provider === 'openai') {
        const apiRes = await fetch(`https://api.openai.com/v1/videos/${encodeURIComponent(requestId)}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(errData.error?.message || `Status check failed: ${apiRes.status}`);
        }

        const data = await apiRes.json() as {
          id?: string;
          status?: string;
          error?: { message?: string };
        };

        if (data.status === 'completed') {
          // Video content available at GET /v1/videos/{id}/content/video
          const contentUrl = `https://api.openai.com/v1/videos/${encodeURIComponent(requestId)}/content/video`;
          // Return the content URL — client can stream directly with auth, or we proxy it
          // For simplicity, fetch the video and return as data URL
          try {
            const videoRes = await fetch(contentUrl, {
              headers: { Authorization: `Bearer ${apiKey}` },
            });
            if (videoRes.ok) {
              const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
              const videoDataUrl = `data:video/mp4;base64,${videoBuffer.toString('base64')}`;
              res.json({ status: 'done', video: { url: videoDataUrl }, requestId });
            } else {
              // Fallback: return the content endpoint URL directly
              res.json({ status: 'done', video: { url: contentUrl }, requestId });
            }
          } catch {
            res.json({ status: 'done', video: { url: contentUrl }, requestId });
          }
        } else if (data.status === 'failed') {
          res.json({
            status: 'failed',
            error: data.error?.message || 'Video generation failed',
            requestId,
          });
        } else {
          // queued, in_progress → map to 'pending' for client consistency
          res.json({ status: 'pending', requestId });
        }
      } else {
        res.status(400).json({ error: `Unknown provider: ${provider}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Status check failed';
      res.status(500).json({ error: msg });
    }
  });

  // ---- Video Edit ----

  app.post('/api/video/edit', async (req: Request, res: Response) => {
    const { prompt, video_url, provider = 'xai', model } = req.body;
    // resolution, aspect_ratio, duration are intentionally not extracted —
    // xAI /v1/videos/edits inherits these from the source video.

    if (!prompt || !video_url) {
      res.status(400).json({ error: 'prompt and video_url are required' });
      return;
    }

    const keys = getProviderKeys();
    const apiKey = keys[provider];
    if (!apiKey) {
      res.status(400).json({ error: `No API key for ${provider}` });
      return;
    }

    try {
      if (provider === 'xai') {
        const body: Record<string, unknown> = {
          model: model || 'grok-imagine-video',
          prompt,
          video: { url: video_url },
        };

        const apiRes = await fetch('https://api.x.ai/v1/videos/edits', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error || `Video edit failed: ${apiRes.status}`);
        }

        const data = await apiRes.json() as { request_id?: string };
        res.json({ requestId: data.request_id, provider: 'xai' });
      } else {
        res.status(400).json({ error: `Video editing not supported for provider: ${provider}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video edit failed';
      res.status(500).json({ error: msg });
    }
  });

  // ---- Video Extend ----

  app.post('/api/video/extend', async (req: Request, res: Response) => {
    const { video_url, prompt, provider = 'xai', model, duration } = req.body;

    if (!video_url) {
      res.status(400).json({ error: 'video_url is required' });
      return;
    }

    const keys = getProviderKeys();
    const apiKey = keys[provider];
    if (!apiKey) {
      res.status(400).json({ error: `No API key for ${provider}` });
      return;
    }

    try {
      if (provider === 'xai') {
        const body: Record<string, unknown> = {
          model: model || 'grok-imagine-video',
          video: { url: video_url },
        };
        if (prompt) body.prompt = prompt;
        if (duration) body.duration = duration;

        const apiRes = await fetch('https://api.x.ai/v1/videos/extensions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error || `Video extend failed: ${apiRes.status}`);
        }

        const data = await apiRes.json() as { request_id?: string };
        res.json({ requestId: data.request_id, provider: 'xai' });
      } else {
        res.status(400).json({ error: `Video extend not supported for provider: ${provider}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video extend failed';
      res.status(500).json({ error: msg });
    }
  });

  // ---- Image Edit ----
  // xAI: POST /v1/images/edits, OpenAI: POST /v1/images/edits

  app.post('/api/image/edit', async (req: Request, res: Response) => {
    const { prompt, image_url, provider = 'xai', model, size, n = 1 } = req.body;

    if (!prompt || !image_url) {
      res.status(400).json({ error: 'prompt and image_url are required' });
      return;
    }

    const keys = getProviderKeys();
    const apiKey = keys[provider];
    if (!apiKey) {
      res.status(400).json({ error: `No API key for ${provider}` });
      return;
    }

    try {
      if (provider === 'xai') {
        const apiRes = await fetch('https://api.x.ai/v1/images/edits', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model || 'grok-imagine-image-quality',
            prompt,
            image: { url: image_url, type: 'image_url' },
            n,
          }),
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error || `Image edit failed: ${apiRes.status}`);
        }

        const data = await apiRes.json() as { data?: Array<{ url?: string; b64_json?: string }> };
        const images = (data.data || []).map(d =>
          d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : ''),
        ).filter(Boolean);
        res.json({ images });
      } else if (provider === 'openai') {
        // OpenAI image edit requires downloading image and sending as form data
        const imageRes = await fetch(image_url);
        const imageBlob = await imageRes.blob();

        const formData = new FormData();
        formData.append('image', imageBlob, 'source.png');
        formData.append('prompt', prompt);
        formData.append('model', model || 'dall-e-2');
        formData.append('n', String(n));
        if (size) formData.append('size', size);

        const apiRes = await fetch('https://api.openai.com/v1/images/edits', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}` },
          body: formData,
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(errData.error?.message || `Image edit failed: ${apiRes.status}`);
        }

        const data = await apiRes.json() as { data?: Array<{ url?: string; b64_json?: string }> };
        const images = (data.data || []).map(d =>
          d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : ''),
        ).filter(Boolean);
        res.json({ images });
      } else if (provider === 'gemini') {
        // Gemini image edit via generateContent with image input
        const geminiKey = apiKey;
        const geminiModel = model || 'gemini-3.1-flash-image-preview';

        // Fetch the source image
        const imageRes = await fetch(image_url);
        const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
        const base64Image = imageBuffer.toString('base64');
        const mimeType = imageRes.headers.get('content-type') || 'image/png';

        const apiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inlineData: { mimeType, data: base64Image } },
                  { text: prompt },
                ],
              }],
              generationConfig: {
                responseModalities: ['IMAGE', 'TEXT'],
              },
            }),
          },
        );

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(errData.error?.message || `Gemini edit failed: ${apiRes.status}`);
        }

        const data = await apiRes.json() as {
          candidates?: Array<{
            content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
          }>;
        };

        const images: string[] = [];
        for (const candidate of data.candidates || []) {
          for (const part of candidate.content?.parts || []) {
            if (part.inlineData?.data) {
              const mime = part.inlineData.mimeType || 'image/png';
              images.push(`data:${mime};base64,${part.inlineData.data}`);
            }
          }
        }
        res.json({ images });
      } else {
        res.status(400).json({ error: `Image editing not supported for provider: ${provider}` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image edit failed';
      res.status(500).json({ error: msg });
    }
  });

  // ---- Vision (Image Analysis) ----
  // Gateway: POST /v1/llm/vision { provider, model, image, prompt, media_type }

  app.post('/api/vision/analyze', async (req: Request, res: Response) => {
    const { provider, model, image, prompt, media_type = 'image/png' } = req.body;

    if (!provider || !model || !image) {
      res.status(400).json({ error: 'provider, model, and image are required' });
      return;
    }

    try {
      const data = await gatewayPost('/v1/llm/vision', {
        provider, model, image, prompt: prompt || 'Describe this image.',
        media_type,
      }) as { text?: string };

      res.json({ text: data.text || '' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Vision analysis failed';
      res.status(500).json({ error: msg });
    }
  });

  // ---- Text-to-Speech ----
  // Gateway: POST /v1/llm/speech { text, provider, voice, model }

  app.post('/api/tts/generate', async (req: Request, res: Response) => {
    const {
      text, provider = 'openai', voice = 'alloy', model = 'tts-1',
      speed, codec, sample_rate, bit_rate,
    } = req.body;

    if (!text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    const keys = getProviderKeys();

    try {
      if (provider === 'xai' && keys.xai) {
        // Direct xAI TTS call — uses voice_id, language, output_format object
        const { language = 'en' } = req.body;
        const body: Record<string, unknown> = {
          text,
          voice_id: voice || 'eve',
          language,
        };
        if (codec || sample_rate || bit_rate) {
          const outputFormat: Record<string, unknown> = {};
          if (codec) outputFormat.codec = codec;
          if (sample_rate) outputFormat.sample_rate = sample_rate;
          if (bit_rate) outputFormat.bit_rate = bit_rate;
          body.output_format = outputFormat;
        }

        const apiRes = await fetch('https://api.x.ai/v1/tts', {
          method: 'POST',
          headers: { Authorization: `Bearer ${keys.xai}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error || `xAI TTS error: ${apiRes.status}`);
        }

        const audioBuffer = Buffer.from(await apiRes.arrayBuffer());
        const ext = codec === 'opus' ? 'opus' : codec === 'flac' ? 'flac' : codec === 'wav' ? 'wav' : 'mp3';
        const mimeType = ext === 'opus' ? 'audio/ogg' : ext === 'flac' ? 'audio/flac' : ext === 'wav' ? 'audio/wav' : 'audio/mpeg';
        res.json({ audioUrl: `data:${mimeType};base64,${audioBuffer.toString('base64')}`, codec: ext });
      } else if (provider === 'openai' && keys.openai) {
        // Direct OpenAI TTS call
        const body: Record<string, unknown> = {
          model: model || 'tts-1',
          input: text,
          voice: voice || 'alloy',
        };
        if (speed) body.speed = speed;

        const apiRes = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${keys.openai}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(errData.error?.message || `OpenAI TTS error: ${apiRes.status}`);
        }

        const audioBuffer = Buffer.from(await apiRes.arrayBuffer());
        res.json({ audioUrl: `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`, codec: 'mp3' });
      } else if (provider === 'gemini' && keys.gemini) {
        // Direct Gemini TTS via generateContent with speechConfig
        const ttsModel = model || 'gemini-3.1-flash-tts-preview';
        const apiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${ttsModel}:generateContent?key=${keys.gemini}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text }] }],
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voice || 'Kore' },
                  },
                },
              },
            }),
          },
        );

        if (!apiRes.ok) {
          const errData = await apiRes.json().catch(() => ({})) as { error?: { message?: string } };
          throw new Error(errData.error?.message || `Gemini TTS error: ${apiRes.status}`);
        }

        const data = await apiRes.json() as {
          candidates?: Array<{
            content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
          }>;
        };

        const audioPart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
        if (!audioPart?.inlineData?.data) {
          throw new Error('No audio returned from Gemini');
        }

        // Gemini returns PCM 24kHz mono 16-bit — prepend WAV header
        const pcmBase64 = audioPart.inlineData.data;
        const pcmBuffer = Buffer.from(pcmBase64, 'base64');
        const wavHeader = Buffer.alloc(44);
        const sampleRateHz = 24000;
        const bitsPerSample = 16;
        const numChannels = 1;
        const byteRate = sampleRateHz * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        wavHeader.write('RIFF', 0);
        wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
        wavHeader.write('WAVE', 8);
        wavHeader.write('fmt ', 12);
        wavHeader.writeUInt32LE(16, 16);
        wavHeader.writeUInt16LE(1, 20); // PCM
        wavHeader.writeUInt16LE(numChannels, 22);
        wavHeader.writeUInt32LE(sampleRateHz, 24);
        wavHeader.writeUInt32LE(byteRate, 28);
        wavHeader.writeUInt16LE(blockAlign, 30);
        wavHeader.writeUInt16LE(bitsPerSample, 32);
        wavHeader.write('data', 36);
        wavHeader.writeUInt32LE(pcmBuffer.length, 40);
        const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

        res.json({ audioUrl: `data:audio/wav;base64,${wavBuffer.toString('base64')}`, codec: 'wav' });
      } else {
        // Fallback: gateway
        const data = await gatewayPost('/v1/llm/speech', {
          text, provider, voice, model,
        }) as { audio_data?: string };

        if (data.audio_data) {
          res.json({ audioUrl: `data:audio/mp3;base64,${data.audio_data}` });
        } else {
          res.status(500).json({ error: 'No audio generated' });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'TTS failed';
      res.status(500).json({ error: msg });
    }
  });

  // ---- Speech-to-Text ----
  // Gateway: POST /v1/voice/transcribe (multipart form: audio file)
  // For now, expose as a passthrough — client sends base64 audio

  app.post('/api/stt/transcribe', async (req: Request, res: Response) => {
    const { audio, language } = req.body;

    if (!audio) {
      res.status(400).json({ error: 'audio (base64) is required' });
      return;
    }

    try {
      // Convert base64 to form data for the gateway
      const audioBuffer = Buffer.from(audio, 'base64');
      const formData = new FormData();
      formData.append('audio', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm');
      if (language) formData.append('language', language);

      const apiRes = await fetch(`${gatewayUrl}/v1/voice/transcribe`, {
        method: 'POST',
        headers: { 'X-API-Key': gatewayKey },
        body: formData,
        signal: AbortSignal.timeout(30000),
      });

      if (!apiRes.ok) {
        const errData = await apiRes.json().catch(() => ({})) as { error?: string };
        throw new Error(errData.error || `STT error: ${apiRes.status}`);
      }

      const data = await apiRes.json() as { text?: string; language?: string };
      res.json({ text: data.text || '', language: data.language });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed';
      res.status(500).json({ error: msg });
    }
  });

  // ---- Available Voices (for TTS UI) ----

  app.get('/api/tts/voices', async (_req: Request, res: Response) => {
    const providers: Record<string, {
      voices: Array<string | { id: string; name: string }>;
      defaultVoice: string;
      models: string[];
      supportsCodec?: boolean;
      supportsSpeechTags?: boolean;
      supportsSpeed?: boolean;
    }> = {
      openai: {
        voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
        defaultVoice: 'alloy',
        models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'],
        supportsSpeed: true,
      },
      xai: {
        voices: [],
        defaultVoice: 'eve',
        models: [],
        supportsCodec: true,
        supportsSpeechTags: true,
      },
    };

    // Try to fetch live xAI voices
    const keys = getProviderKeys();
    if (keys.xai) {
      try {
        const apiRes = await fetch('https://api.x.ai/v1/tts/voices', {
          headers: { Authorization: `Bearer ${keys.xai}` },
          signal: AbortSignal.timeout(5000),
        });
        if (apiRes.ok) {
          const data = await apiRes.json() as { voices?: Array<{ voice_id: string; name: string }> };
          if (data.voices?.length) {
            providers.xai.voices = data.voices.map(v => ({ id: v.voice_id, name: v.name }));
            providers.xai.defaultVoice = data.voices[0].voice_id;
          }
        }
      } catch {
        // Fallback to known xAI voices
        providers.xai.voices = [
          { id: 'eve', name: 'Eve (energetic)' },
          { id: 'ara', name: 'Ara (warm)' },
          { id: 'rex', name: 'Rex (confident)' },
          { id: 'sal', name: 'Sal (smooth)' },
          { id: 'leo', name: 'Leo (authoritative)' },
        ];
      }
    }

    if (!providers.xai.voices.length) {
      providers.xai.voices = [
        { id: 'eve', name: 'Eve (energetic)' },
        { id: 'ara', name: 'Ara (warm)' },
        { id: 'rex', name: 'Rex (confident)' },
        { id: 'sal', name: 'Sal (smooth)' },
        { id: 'leo', name: 'Leo (authoritative)' },
      ];
    }

    // Add Gemini TTS voices if key available
    if (keys.gemini) {
      providers.gemini = {
        voices: [
          'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir',
          'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
          'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina',
          'Erinome', 'Gacrux', 'Achird', 'Zubenelgenubi', 'Pulcherrima',
          'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat', 'Laomedeia',
          'Achernar', 'Rasalgethi', 'Sargas', 'Schedar', 'Shaula',
        ],
        defaultVoice: 'Kore',
        models: ['gemini-2.5-flash-preview-tts'],
      };
    }

    res.json({ providers });
  });
}
