import Anthropic from '@anthropic-ai/sdk';
import { summarizeWithClaude, type SummarizeRequest } from '../../src/lib/summarizeCore';

interface Env {
  ANTHROPIC_API_KEY: string;
  CACHE?: KVNamespace;
}

const MODEL = 'claude-opus-5-5';
const CACHE_TTL_SECONDS = 7 * 86_400;
const MAX_BODY_BYTES = 3_000_000;

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...cors } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/summarize') return json({ error: 'Not found' }, 404);
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return json({ error: 'Too large' }, 413);

    let body: SummarizeRequest & { effort?: 'low' | 'medium' | 'high' };
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }
    if (!body?.site || !Array.isArray(body.documents) || body.documents.length === 0) {
      return json({ error: 'Expected { site, documents[], language }' }, 400);
    }
    const effort = body.effort ?? 'low';
    const language = body.language || 'English';

    const cacheKey = `v1:${MODEL}:${effort}:${language}:${await sha256(body.documents.map((d) => d.text).join('\n'))}`;
    const cached = await env.CACHE?.get(cacheKey, 'json');
    if (cached) return json(cached);

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    try {
      const result = await summarizeWithClaude(client, { site: body.site, documents: body.documents, language }, { model: MODEL, effort });
      await env.CACHE?.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS });
      return json(result);
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return json({ error: 'Rate limited, try again shortly' }, 429);
      if (e instanceof Anthropic.APIError) return json({ error: `Upstream error ${e.status}` }, 502);
      return json({ error: (e as Error).message }, 500);
    }
  },
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
