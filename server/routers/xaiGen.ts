// ============================================================
// xaiGen — xAI generation procedures, lifted from ux-llm-media's
// routers/xai.ts (Stage 2 of the universal merge). Registered as
// `xaiGen` (NOT `xai`) per merge blueprint Section 4.
//
// Deliberately dropped from the media original (dual-path hazard /
// already covered in glm):
//   - chat, createResponse/getResponse/deleteResponse,
//     deferredCompletion        → dreamer-proxy is the chat hub
//   - models/languageModels/modelDetails/languageModelDetails
//                                → dreamer-proxy provider discovery
//   - batch* procedures          → xai-utility-proxy /api/xai/batches/*
//   - realtimeSecret             → xai-utility-proxy /api/voice/realtime/session
//   - tokenize                   → xai-utility-proxy /api/tokenize
//   - apiKeyInfo                 → utility, not generation
// ============================================================

import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { persistMediaFromUrl } from "../_core/persist-media";
import {
  generateImage,
  editImage,
  generateVideo,
  editVideo,
  extendVideo,
  getVideoStatus,
  textToSpeech,
  listVoices,
  getVoiceDetails,
  listImageGenerationModels,
  getImageGenerationModel,
  listVideoGenerationModels,
  getVideoGenerationModel,
} from "../xai-api";
import { storagePut } from "../storage";
import { saveCachedContent } from "../db";
import { nanoid } from "nanoid";

export const xaiGenRouter = router({
  // ─── Image Generation ─────────────────────────────────────────────────
  imageGenerate: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        model: z.string().optional(),
        n: z.number().min(1).max(4).optional(),
        response_format: z.enum(["url", "b64_json"]).optional(),
        size: z.string().optional(),
        quality: z.string().optional(),
        seed: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await generateImage({
        prompt: input.prompt,
        model: input.model,
        n: input.n,
        response_format: input.response_format,
        size: input.size,
        quality: input.quality,
        seed: input.seed,
      });

      // Persist each generated image to local disk so the URL survives
      // beyond xAI's temporary-URL TTL. Falls back to the upstream URL
      // if the local write fails — the user still sees the image, just
      // for a limited time.
      const images = result?.data || [];
      const persisted = await Promise.all(
        images.map(async (img: any) => {
          if (!img?.url) return img;
          try {
            const p = await persistMediaFromUrl(img.url, { kind: "image", provider: "xai" });
            return { ...img, url: p.publicUrl, sourceUrl: img.url };
          } catch (e) {
            console.warn("[persist] xai image persist failed:", (e as Error).message);
            return img;
          }
        }),
      );

      // Cache each generated image (now pointing at the persistent URL)
      const saved = await Promise.all(
        persisted.map((img: any) =>
          saveCachedContent({
            userId: ctx.user.id,
            type: "image",
            contentUrl: img.url,
            prompt: img.revised_prompt ?? input.prompt,
            model: `xai/${input.model || "grok-imagine-image-quality"}`,
            metadata: {
              provider: "xai",
              size: input.size,
              quality: input.quality,
              seed: input.seed,
              revisedPrompt: img.revised_prompt,
              sourceUrl: img.sourceUrl,
            },
          })
        )
      );

      return {
        ...result,
        data: persisted.map((img: any, i: number) => ({
          ...img,
          cachedId: saved[i]?.id,
        })),
      };
    }),

  // ─── Image Edit ───────────────────────────────────────────────────────
  imageEdit: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        image_url: z.string().url(),
        model: z.string().optional(),
        n: z.number().min(1).max(4).optional(),
        response_format: z.enum(["url", "b64_json"]).optional(),
        size: z.string().optional(),
        quality: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const result = await editImage({
        prompt: input.prompt,
        image_url: input.image_url,
        model: input.model,
        n: input.n,
        response_format: input.response_format,
        size: input.size,
        quality: input.quality,
      });

      const images = result?.data || [];
      const persisted = await Promise.all(
        images.map(async (img: any) => {
          if (!img?.url) return img;
          try {
            const p = await persistMediaFromUrl(img.url, { kind: "image", provider: "xai" });
            return { ...img, url: p.publicUrl, providerUrl: img.url };
          } catch (e) {
            console.warn("[persist] xai image-edit persist failed:", (e as Error).message);
            return img;
          }
        }),
      );

      const saved = await Promise.all(
        persisted.map((img: any) =>
          saveCachedContent({
            userId: ctx.user.id,
            type: "image_edit",
            contentUrl: img.url,
            prompt: input.prompt,
            model: `xai/${input.model || "grok-imagine-image-quality"}`,
            metadata: {
              provider: "xai",
              sourceUrl: input.image_url,
              providerUrl: img.providerUrl,
              size: input.size,
              quality: input.quality,
            },
          })
        )
      );

      return {
        ...result,
        data: persisted.map((img: any, i: number) => ({
          ...img,
          cachedId: saved[i]?.id,
        })),
      };
    }),

  // ─── Video Generation ─────────────────────────────────────────────────
  videoGenerate: publicProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        model: z.string().optional(),
        duration: z.number().optional(),
        resolution: z.string().optional(),
        aspect_ratio: z.string().optional(),
        image_url: z.string().url().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await generateVideo({
        prompt: input.prompt,
        model: input.model,
        duration: input.duration,
        resolution: input.resolution,
        aspect_ratio: input.aspect_ratio,
        image_url: input.image_url,
      });
    }),

  // ─── Video Edit ───────────────────────────────────────────────────────
  videoEdit: publicProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        video_url: z.string().url(),
        model: z.string().optional(),
        duration: z.number().optional(),
        resolution: z.string().optional(),
        aspect_ratio: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await editVideo({
        prompt: input.prompt,
        video_url: input.video_url,
        model: input.model,
        duration: input.duration,
        resolution: input.resolution,
        aspect_ratio: input.aspect_ratio,
      });
    }),

  // ─── Video Extend ─────────────────────────────────────────────────────
  videoExtend: publicProcedure
    .input(
      z.object({
        video_url: z.string().url(),
        prompt: z.string().optional(),
        model: z.string().optional(),
        duration: z.number().optional(),
        resolution: z.string().optional(),
        aspect_ratio: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return await extendVideo({
        video_url: input.video_url,
        prompt: input.prompt,
        model: input.model,
        duration: input.duration,
        resolution: input.resolution,
        aspect_ratio: input.aspect_ratio,
      });
    }),

  // ─── Video Status Polling ─────────────────────────────────────────────
  videoStatus: publicProcedure
    .input(z.object({ requestId: z.string() }))
    .query(async ({ input }) => {
      return await getVideoStatus(input.requestId);
    }),

  // ─── Text-to-Speech ───────────────────────────────────────────────────
  tts: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1).max(15000),
        voice_id: z.string().optional(),
        output_format: z
          .object({
            codec: z.enum(["mp3", "wav", "pcm", "mulaw", "alaw"]).optional(),
            sample_rate: z.number().optional(),
            bit_rate: z.number().optional(),
          })
          .optional(),
        speed: z.number().min(0.25).max(4).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const audioBuffer = await textToSpeech({
        text: input.text,
        voice_id: input.voice_id,
        output_format: input.output_format,
        speed: input.speed,
      });
      const codec = input.output_format?.codec || "mp3";
      const mimeMap: Record<string, string> = {
        mp3: "audio/mpeg",
        wav: "audio/wav",
        pcm: "audio/pcm",
        mulaw: "audio/basic",
        alaw: "audio/basic",
      };
      const key = `tts/${nanoid()}.${codec}`;
      const { url } = await storagePut(key, audioBuffer, mimeMap[codec] || "audio/mpeg");

      const cached = await saveCachedContent({
        userId: ctx.user.id,
        type: "tts",
        contentUrl: url,
        prompt: input.text,
        model: "xai/tts",
        metadata: {
          provider: "xai",
          voice: input.voice_id,
          codec,
          speed: input.speed,
        },
      });

      return { url, codec, cachedId: cached?.id };
    }),

  // ─── Voices ───────────────────────────────────────────────────────────
  voices: publicProcedure.query(async () => {
    return await listVoices();
  }),

  voiceDetails: publicProcedure
    .input(z.object({ voiceId: z.string() }))
    .query(async ({ input }) => {
      return await getVoiceDetails(input.voiceId);
    }),

  // ─── Generation Model Listings ────────────────────────────────────────
  imageModels: publicProcedure.query(async () => {
    return await listImageGenerationModels();
  }),

  videoModels: publicProcedure.query(async () => {
    return await listVideoGenerationModels();
  }),

  imageModelDetails: publicProcedure
    .input(z.object({ modelId: z.string() }))
    .query(async ({ input }) => {
      return await getImageGenerationModel(input.modelId);
    }),

  videoModelDetails: publicProcedure
    .input(z.object({ modelId: z.string() }))
    .query(async ({ input }) => {
      return await getVideoGenerationModel(input.modelId);
    }),

  // ─── Upload image for editing (base64 -> stored URL) ──────────────────
  uploadImage: publicProcedure
    .input(
      z.object({
        base64: z.string(),
        mimeType: z.string().default("image/png"),
      })
    )
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const ext = input.mimeType.split("/")[1] || "png";
      const key = `uploads/${nanoid()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      return { url };
    }),

  // ─── Upload video for editing (base64 -> stored URL) ──────────────────
  uploadVideo: publicProcedure
    .input(
      z.object({
        base64: z.string(),
        mimeType: z.string().default("video/mp4"),
      })
    )
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const ext = input.mimeType.split("/")[1] || "mp4";
      const key = `uploads/${nanoid()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      return { url };
    }),
});
