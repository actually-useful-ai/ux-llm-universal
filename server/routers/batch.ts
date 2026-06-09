import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { generateImage, generateVideo, textToSpeech } from "../xai-api";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";

/**
 * Batch generation router.
 * Supports generating any quantity by breaking into batches.
 * Images: xAI supports n=1-4 per request, so we batch in groups of 4.
 * Videos: one at a time (async).
 * TTS: one at a time.
 */

export const batchRouter = router({
  /**
   * Batch image generation.
   * Accepts any quantity, breaks into batches of up to 4.
   * Returns all results at once.
   */
  imageGenerate: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        model: z.string().optional(),
        quantity: z.number().min(1).max(100),
      })
    )
    .mutation(async ({ input }) => {
      const results: Array<{ url: string; index: number }> = [];
      const errors: Array<{ index: number; error: string }> = [];
      let remaining = input.quantity;
      let batchIndex = 0;

      while (remaining > 0) {
        const batchSize = Math.min(remaining, 4);
        try {
          const result = await generateImage({
            prompt: input.prompt,
            model: input.model,
            n: batchSize,
          });

          if (result.data) {
            for (let i = 0; i < result.data.length; i++) {
              results.push({
                url: result.data[i].url || result.data[i].b64_json,
                index: batchIndex * 4 + i,
              });
            }
          }
        } catch (err) {
          for (let i = 0; i < batchSize; i++) {
            errors.push({
              index: batchIndex * 4 + i,
              error: String(err),
            });
          }
        }

        remaining -= batchSize;
        batchIndex++;

        // Small delay between batches to avoid rate limiting
        if (remaining > 0) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      return {
        results,
        errors,
        total: input.quantity,
        succeeded: results.length,
        failed: errors.length,
      };
    }),

  /**
   * Batch video generation.
   * Videos are generated one at a time since each is async.
   * Returns request IDs for polling.
   */
  videoGenerate: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        model: z.string().optional(),
        duration: z.number().optional(),
        image_url: z.string().url().optional(),
        quantity: z.number().min(1).max(20),
      })
    )
    .mutation(async ({ input }) => {
      const requests: Array<{ requestId: string; index: number }> = [];
      const errors: Array<{ index: number; error: string }> = [];

      for (let i = 0; i < input.quantity; i++) {
        try {
          const result = await generateVideo({
            prompt: input.prompt,
            model: input.model,
            duration: input.duration,
            image_url: input.image_url,
          });

          if (result.request_id) {
            requests.push({ requestId: result.request_id, index: i });
          }
        } catch (err) {
          errors.push({ index: i, error: String(err) });
        }

        // Delay between requests
        if (i < input.quantity - 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      return {
        requests,
        errors,
        total: input.quantity,
        submitted: requests.length,
        failed: errors.length,
      };
    }),

  /**
   * Batch TTS generation.
   * Generates multiple audio files from the same or different texts.
   */
  ttsGenerate: protectedProcedure
    .input(
      z.object({
        texts: z.array(z.string().min(1).max(15000)),
        voice_id: z.string().optional(),
        output_format: z
          .object({
            codec: z.enum(["mp3", "wav", "pcm", "mulaw", "alaw"]).optional(),
            sample_rate: z.number().optional(),
            bit_rate: z.number().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      const results: Array<{ url: string; index: number; text: string }> = [];
      const errors: Array<{ index: number; error: string }> = [];
      const codec = input.output_format?.codec || "mp3";
      const mimeMap: Record<string, string> = {
        mp3: "audio/mpeg",
        wav: "audio/wav",
        pcm: "audio/pcm",
        mulaw: "audio/basic",
        alaw: "audio/basic",
      };

      for (let i = 0; i < input.texts.length; i++) {
        try {
          const audioBuffer = await textToSpeech({
            text: input.texts[i],
            voice_id: input.voice_id,
            output_format: input.output_format,
          });

          const key = `tts-batch/${nanoid()}.${codec}`;
          const { url } = await storagePut(key, audioBuffer, mimeMap[codec] || "audio/mpeg");
          results.push({ url, index: i, text: input.texts[i].slice(0, 100) });
        } catch (err) {
          errors.push({ index: i, error: String(err) });
        }

        // Delay between requests
        if (i < input.texts.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      return {
        results,
        errors,
        total: input.texts.length,
        succeeded: results.length,
        failed: errors.length,
      };
    }),
});
