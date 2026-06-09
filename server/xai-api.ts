// ============================================================
// xAI generation API client — non-chat functions only.
// Extracted from ux-llm-media's server/xai.ts (Stage 2 of the
// universal merge). Per the merge blueprint Section 4, the chat /
// responses / language-model / embeddings functions are NOT here:
// dreamer-proxy.ts is the single chat hub, and xai-utility-proxy.ts
// already covers batches, tokenize, and realtime sessions.
//
// Contents: image generation/edit, video generation/edit/extend/
// status, TTS + voices, and the image/video generation-model
// listings these surfaces need.
// ============================================================

import { ENV } from "./_core/env";

const XAI_BASE = "https://api.x.ai";

function getHeaders(contentType = "application/json") {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ENV.xaiApiKey}`,
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  return headers;
}

// ─── Images ──────────────────────────────────────────────────────────────────

export interface ImageGenParams {
  prompt: string;
  model?: string;
  n?: number;
  response_format?: "url" | "b64_json";
  size?: string;
  quality?: string;
  seed?: number;
}

export async function generateImage(params: ImageGenParams) {
  const body: Record<string, unknown> = {
    prompt: params.prompt,
    model: params.model || "grok-imagine-image-quality",
    n: params.n || 1,
    response_format: params.response_format || "url",
  };
  if (params.size) body.size = params.size;
  if (params.quality) body.quality = params.quality;
  if (params.seed !== undefined) body.seed = params.seed;

  const response = await fetch(`${XAI_BASE}/v1/images/generations`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`xAI Image Gen API error (${response.status}): ${errText}`);
  }

  return response.json();
}

export interface ImageEditParams {
  prompt: string;
  image_url: string;
  model?: string;
  n?: number;
  response_format?: "url" | "b64_json";
  size?: string;
  quality?: string;
}

export async function editImage(params: ImageEditParams) {
  const body: Record<string, unknown> = {
    prompt: params.prompt,
    model: params.model || "grok-imagine-image-quality",
    n: params.n || 1,
    response_format: params.response_format || "url",
    image: { url: params.image_url },
  };
  if (params.size) body.size = params.size;
  if (params.quality) body.quality = params.quality;

  const response = await fetch(`${XAI_BASE}/v1/images/edits`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`xAI Image Edit API error (${response.status}): ${errText}`);
  }

  return response.json();
}

// ─── Videos ──────────────────────────────────────────────────────────────────

export interface VideoGenParams {
  prompt: string;
  model?: string;
  duration?: number;
  resolution?: string;
  aspect_ratio?: string;
  image_url?: string;
}

export async function generateVideo(params: VideoGenParams) {
  const body: Record<string, unknown> = {
    prompt: params.prompt,
    model: params.model || "grok-imagine-video",
  };
  if (params.duration) body.duration = params.duration;
  if (params.resolution) body.resolution = params.resolution;
  if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio;
  if (params.image_url) body.image = { url: params.image_url };

  const response = await fetch(`${XAI_BASE}/v1/videos/generations`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`xAI Video Gen API error (${response.status}): ${errText}`);
  }

  return response.json();
}

export interface VideoEditParams {
  prompt: string;
  video_url: string;
  model?: string;
  duration?: number;
  resolution?: string;
  aspect_ratio?: string;
}

export async function editVideo(params: VideoEditParams) {
  const body: Record<string, unknown> = {
    prompt: params.prompt,
    model: params.model || "grok-imagine-video",
    video: { url: params.video_url },
  };
  if (params.duration) body.duration = params.duration;
  if (params.resolution) body.resolution = params.resolution;
  if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio;

  const response = await fetch(`${XAI_BASE}/v1/videos/edits`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`xAI Video Edit API error (${response.status}): ${errText}`);
  }

  return response.json();
}

export async function getVideoStatus(requestId: string) {
  const response = await fetch(`${XAI_BASE}/v1/videos/${requestId}`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (response.status === 202) {
    return { status: "processing" };
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`xAI Video Status API error (${response.status}): ${errText}`);
  }

  return response.json();
}

export async function extendVideo(params: {
  video_url: string;
  prompt?: string;
  model?: string;
  duration?: number;
  resolution?: string;
  aspect_ratio?: string;
}) {
  const body: Record<string, unknown> = {
    prompt:
      params.prompt ||
      "Continue this video seamlessly, maintaining the same style, motion, and subject",
    model: params.model || "grok-imagine-video",
    video: { url: params.video_url },
  };
  if (params.duration) body.duration = params.duration;
  if (params.resolution) body.resolution = params.resolution;
  if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio;

  const response = await fetch(`${XAI_BASE}/v1/videos/edits`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`xAI Video Extend API error (${response.status}): ${errText}`);
  }

  return response.json();
}

// ─── Voice / TTS ─────────────────────────────────────────────────────────────

export interface TTSParams {
  text: string;
  voice_id?: string;
  output_format?: {
    codec?: "mp3" | "wav" | "pcm" | "mulaw" | "alaw";
    sample_rate?: number;
    bit_rate?: number;
  };
  speed?: number;
}

export async function textToSpeech(params: TTSParams) {
  const body: Record<string, unknown> = {
    text: params.text,
  };
  if (params.voice_id) body.voice_id = params.voice_id;
  if (params.output_format) body.output_format = params.output_format;
  if (params.speed !== undefined) body.speed = params.speed;

  const response = await fetch(`${XAI_BASE}/v1/tts`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`xAI TTS API error (${response.status}): ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function listVoices() {
  const response = await fetch(`${XAI_BASE}/v1/tts/voices`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`xAI Voices API error (${response.status}): ${errText}`);
  }

  return response.json();
}

export async function getVoiceDetails(voiceId: string) {
  const response = await fetch(`${XAI_BASE}/v1/tts/voices/${voiceId}`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`xAI Voice Detail API error (${response.status}): ${errText}`);
  }

  return response.json();
}

// ─── Generation Model Listings ───────────────────────────────────────────────
// Only the image/video generation-model endpoints. Chat-model listings are
// handled by dreamer-proxy's provider discovery.

export async function listImageGenerationModels() {
  const response = await fetch(`${XAI_BASE}/v1/image-generation-models`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`xAI Image Gen Models API error (${response.status}): ${errText}`);
  }

  return response.json();
}

export async function listVideoGenerationModels() {
  const response = await fetch(`${XAI_BASE}/v1/video-generation-models`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`xAI Video Gen Models API error (${response.status}): ${errText}`);
  }

  return response.json();
}

export async function getImageGenerationModel(modelId: string) {
  const response = await fetch(`${XAI_BASE}/v1/image-generation-models/${modelId}`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`xAI Image Gen Model API error (${response.status}): ${errText}`);
  }

  return response.json();
}

export async function getVideoGenerationModel(modelId: string) {
  const response = await fetch(`${XAI_BASE}/v1/video-generation-models/${modelId}`, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`xAI Video Gen Model API error (${response.status}): ${errText}`);
  }

  return response.json();
}
