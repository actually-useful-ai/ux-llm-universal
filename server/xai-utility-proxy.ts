import type { Express, Request, Response } from 'express';

const XAI_BASE = 'https://api.x.ai';

function getXaiApiKey(): string {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    throw new Error('XAI_API_KEY is not configured');
  }
  return key;
}

async function proxyXaiJson(
  path: string,
  body: Record<string, unknown>,
): Promise<globalThis.Response> {
  const res = await fetch(`${XAI_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getXaiApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return res;
}

export function registerXaiUtilityProxy(app: Express) {
  app.post('/api/voice/realtime/session', async (req: Request, res: Response) => {
    try {
      const expiresAfterSeconds = typeof req.body?.expiresAfterSeconds === 'number'
        ? req.body.expiresAfterSeconds
        : undefined;

      const body: Record<string, unknown> = {};
      if (expiresAfterSeconds) {
        body.expires_after = { seconds: expiresAfterSeconds };
      }

      const apiRes = await proxyXaiJson('/v1/realtime/client_secrets', body);
      const text = await apiRes.text();

      if (!apiRes.ok) {
        return res.status(apiRes.status).json({
          error: text || 'Failed to create realtime session',
        });
      }

      try {
        return res.json(JSON.parse(text));
      } catch {
        return res.status(502).json({ error: 'Invalid realtime session response' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create realtime session';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/tokenize', async (req: Request, res: Response) => {
    try {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';

      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const apiRes = await proxyXaiJson('/v1/tokenize-text', {
        text,
        ...(model ? { model } : {}),
      });
      const responseText = await apiRes.text();

      if (!apiRes.ok) {
        return res.status(apiRes.status).json({
          error: responseText || 'Tokenization failed',
        });
      }

      try {
        return res.json(JSON.parse(responseText));
      } catch {
        return res.status(502).json({ error: 'Invalid tokenization response' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tokenization failed';
      return res.status(500).json({ error: message });
    }
  });
}
