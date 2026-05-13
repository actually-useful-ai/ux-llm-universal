// ============================================================
// Auto-Retry — Smart prompt rewriting for moderation failures
// Uses Grok to rewrite rejected prompts; learns from successes
// ============================================================

import { desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { rewriteRules } from '../drizzle/schema';

const MODERATION_KEYWORDS = [
  'content policy', 'safety', 'inappropriate', 'blocked',
  'harmful', 'moderation', 'violat', 'not allowed',
  'prohibited', 'unsafe', 'rejected', 'content_policy',
];

/** Check if an error message indicates a moderation/content-policy rejection */
export function detectModerationError(error: string): boolean {
  const lower = error.toLowerCase();
  return MODERATION_KEYWORDS.some(kw => lower.includes(kw));
}

/** Fetch recent successful rewrites from DB for the given category */
async function getRecentRewrites(category: string, limit = 10): Promise<{ original: string; rewritten: string }[]> {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.select({
      original: rewriteRules.originalPrompt,
      rewritten: rewriteRules.rewrittenPrompt,
    })
      .from(rewriteRules)
      .where(eq(rewriteRules.category, category))
      .orderBy(desc(rewriteRules.createdAt))
      .limit(limit);
    return rows.map(r => ({ original: r.original, rewritten: r.rewritten }));
  } catch {
    return [];
  }
}

/** Rewrite a prompt using xAI Grok to avoid content policy issues */
export async function rewritePrompt(
  prompt: string,
  category: string,
  attempt: number,
): Promise<string> {
  const xaiKey = process.env.XAI_API_KEY;
  if (!xaiKey) throw new Error('XAI_API_KEY not configured for auto-retry');

  const pastRewrites = await getRecentRewrites(category);
  const examplesBlock = pastRewrites.length > 0
    ? `\n\nHere are examples of successful rewrites in this category:\n${pastRewrites.map((r, i) => `${i + 1}. Original: "${r.original}"\n   Rewritten: "${r.rewritten}"`).join('\n')}\n`
    : '';

  const temperature = Math.min(0.7 + (attempt - 1) * 0.1, 1.2);

  const systemPrompt = `You are a prompt rewriting assistant. The user's prompt was rejected by a content moderation filter.
Your job is to rewrite the prompt to express the same creative intent while avoiding content policy triggers.

Rules:
- Keep the same artistic/creative intent
- Use more abstract, metaphorical, or artistic language
- Avoid explicit or graphic descriptions
- Focus on mood, atmosphere, composition rather than literal depictions
- Return ONLY the rewritten prompt, nothing else${examplesBlock}`;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${xaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-4.3',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Rewrite this rejected prompt (attempt ${attempt}):\n\n"${prompt}"` },
      ],
      temperature,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`Rewrite request failed: ${response.status}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const rewritten = data.choices?.[0]?.message?.content?.trim();
  if (!rewritten) throw new Error('Empty rewrite response');

  // Strip surrounding quotes if present
  return rewritten.replace(/^["']|["']$/g, '');
}

/** Save a successful prompt rewrite to the DB for learning */
export async function saveSuccessfulRewrite(
  original: string,
  rewritten: string,
  category: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(rewriteRules).values({
      category,
      originalPrompt: original,
      rewrittenPrompt: rewritten,
    });
  } catch (err) {
    console.warn('[AutoRetry] Failed to save rewrite rule:', err);
  }
}

/**
 * Generic auto-retry wrapper for generation functions.
 * If a generation fails with a moderation error, rewrites the prompt and retries.
 */
export async function withAutoRetry<T>(
  generateFn: (prompt: string) => Promise<T>,
  originalPrompt: string,
  category: string,
  maxRetries: number = 0,
): Promise<{ result: T; rewrittenPrompt?: string; attempts: number }> {
  // First attempt with original prompt
  try {
    const result = await generateFn(originalPrompt);
    return { result, attempts: 1 };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    if (maxRetries <= 0 || !detectModerationError(errorMsg)) {
      throw err;
    }

    // Auto-retry with rewritten prompts
    let lastError = errorMsg;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const rewritten = await rewritePrompt(originalPrompt, category, attempt);
        console.log(`[AutoRetry] Attempt ${attempt + 1}: rewritten prompt = "${rewritten.slice(0, 80)}..."`);

        const result = await generateFn(rewritten);

        // Success! Save the rewrite for learning
        await saveSuccessfulRewrite(originalPrompt, rewritten, category);
        return { result, rewrittenPrompt: rewritten, attempts: attempt + 1 };
      } catch (retryErr) {
        lastError = retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (!detectModerationError(lastError)) {
          throw retryErr; // Non-moderation error, don't retry
        }
      }
    }

    throw new Error(`All ${maxRetries + 1} attempts failed. Last error: ${lastError}`);
  }
}
