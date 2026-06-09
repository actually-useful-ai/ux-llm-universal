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

  app.post('/api/xai/batches', async (req: Request, res: Response) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      if (!name) {
        return res.status(400).json({ error: 'Batch name is required' });
      }

      const apiRes = await proxyXaiJson('/v1/batches', { name });
      const responseText = await apiRes.text();

      if (!apiRes.ok) {
        return res.status(apiRes.status).json({ error: responseText || 'Failed to create batch' });
      }

      return res.json(JSON.parse(responseText));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create batch';
      return res.status(500).json({ error: message });
    }
  });

  app.get('/api/xai/batches', async (req: Request, res: Response) => {
    try {
      const params = new URLSearchParams();
      if (typeof req.query.limit === 'string' && req.query.limit) params.set('limit', req.query.limit);
      if (typeof req.query.pagination_token === 'string' && req.query.pagination_token) {
        params.set('pagination_token', req.query.pagination_token);
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const apiRes = await fetch(`${XAI_BASE}/v1/batches${suffix}`, {
        headers: { Authorization: `Bearer ${getXaiApiKey()}` },
        signal: AbortSignal.timeout(15000),
      });
      const responseText = await apiRes.text();

      if (!apiRes.ok) {
        return res.status(apiRes.status).json({ error: responseText || 'Failed to list batches' });
      }

      return res.json(JSON.parse(responseText));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list batches';
      return res.status(500).json({ error: message });
    }
  });

  app.get('/api/xai/batches/:batchId', async (req: Request, res: Response) => {
    try {
      const apiRes = await fetch(`${XAI_BASE}/v1/batches/${encodeURIComponent(req.params.batchId)}`, {
        headers: { Authorization: `Bearer ${getXaiApiKey()}` },
        signal: AbortSignal.timeout(15000),
      });
      const responseText = await apiRes.text();

      if (!apiRes.ok) {
        return res.status(apiRes.status).json({ error: responseText || 'Failed to fetch batch' });
      }

      return res.json(JSON.parse(responseText));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch batch';
      return res.status(500).json({ error: message });
    }
  });

  app.get('/api/xai/batches/:batchId/requests', async (req: Request, res: Response) => {
    try {
      const params = new URLSearchParams();
      if (typeof req.query.limit === 'string' && req.query.limit) params.set('limit', req.query.limit);
      if (typeof req.query.pagination_token === 'string' && req.query.pagination_token) {
        params.set('pagination_token', req.query.pagination_token);
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const apiRes = await fetch(`${XAI_BASE}/v1/batches/${encodeURIComponent(req.params.batchId)}/requests${suffix}`, {
        headers: { Authorization: `Bearer ${getXaiApiKey()}` },
        signal: AbortSignal.timeout(15000),
      });
      const responseText = await apiRes.text();

      if (!apiRes.ok) {
        return res.status(apiRes.status).json({ error: responseText || 'Failed to list batch requests' });
      }

      return res.json(JSON.parse(responseText));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list batch requests';
      return res.status(500).json({ error: message });
    }
  });

  app.get('/api/xai/batches/:batchId/results', async (req: Request, res: Response) => {
    try {
      const params = new URLSearchParams();
      if (typeof req.query.limit === 'string' && req.query.limit) params.set('limit', req.query.limit);
      if (typeof req.query.pagination_token === 'string' && req.query.pagination_token) {
        params.set('pagination_token', req.query.pagination_token);
      }
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const apiRes = await fetch(`${XAI_BASE}/v1/batches/${encodeURIComponent(req.params.batchId)}/results${suffix}`, {
        headers: { Authorization: `Bearer ${getXaiApiKey()}` },
        signal: AbortSignal.timeout(15000),
      });
      const responseText = await apiRes.text();

      if (!apiRes.ok) {
        return res.status(apiRes.status).json({ error: responseText || 'Failed to fetch batch results' });
      }

      return res.json(JSON.parse(responseText));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch batch results';
      return res.status(500).json({ error: message });
    }
  });

  // API key introspection (GET /v1/api-key). Stage 4 of the universal merge:
  // media's trpc xai.apiKeyInfo lands here because it is utility, not generation.
  app.get('/api/xai/api-key', async (_req: Request, res: Response) => {
    try {
      const apiRes = await fetch(`${XAI_BASE}/v1/api-key`, {
        headers: { Authorization: `Bearer ${getXaiApiKey()}` },
        signal: AbortSignal.timeout(15000),
      });
      const responseText = await apiRes.text();

      if (!apiRes.ok) {
        return res.status(apiRes.status).json({ error: responseText || 'Failed to fetch API key info' });
      }

      return res.json(JSON.parse(responseText));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch API key info';
      return res.status(500).json({ error: message });
    }
  });

  app.post('/api/xai/batches/:batchId/cancel', async (req: Request, res: Response) => {
    try {
      const apiRes = await fetch(`${XAI_BASE}/v1/batches/${encodeURIComponent(req.params.batchId)}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getXaiApiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(15000),
      });
      const responseText = await apiRes.text();

      if (!apiRes.ok) {
        return res.status(apiRes.status).json({ error: responseText || 'Failed to cancel batch' });
      }

      return res.json(responseText ? JSON.parse(responseText) : { success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel batch';
      return res.status(500).json({ error: message });
    }
  });
}
