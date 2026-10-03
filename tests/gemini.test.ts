import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PolicySummary } from '@/lib/schema';
import { GeminiKeyError, summarizeWithGemini } from '@/lib/summarizeGemini';

const SUMMARY: PolicySummary = {
  tldr: 'Needs your email; shares browsing data with ad partners.',
  score: 'D',
  scoreReason: 'Extensive ad sharing.',
  strictlyNecessary: [{ data: 'Email', purpose: 'Account', quote: '' }],
  optional: [{ data: 'Browsing', purpose: 'Ads', category: 'advertising', risk: 'dangerous' }],
  thirdParties: [{ name: 'Ad partners', purpose: 'Ads', sells: false, risk: 'dangerous' }],
  sellsData: false,
  partnerCount: null,
  retention: 'Not stated',
  yourRights: [],
  howToOptOut: 'Not stated',
  redFlags: [],
};

const req = {
  site: 'shop.test',
  language: 'English',
  documents: [{ kind: 'privacy', url: 'https://shop.test/privacy', text: 'We share browsing data with ad partners.' }],
};

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('summarizeWithGemini', () => {
  it('sends the policy with a JSON schema and parses the structured reply', async () => {
    const fetchMock = mockFetch(200, {
      candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(SUMMARY) }] }, finishReason: 'STOP' }],
      modelVersion: 'gemini-3.8-flash',
    });

    const out = await summarizeWithGemini('test-key', req, { model: 'gemini-3.8-flash', effort: 'low' });
    expect(out.summary.score).toBe('D');
    expect(out.model).toBe('gemini-3.8-flash');
    expect(out.truncated).toBe(false);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toContain('models/gemini-3.8-flash:generateContent');
    const sent = JSON.parse(String(init.body));
    expect(sent.systemInstruction.parts[0].text).toMatch(/untrusted data/);
    expect(sent.contents[0].parts[0].text).toContain('<policy_document kind="privacy"');
    expect(sent.generationConfig.responseMimeType).toBe('application/json');
    expect(sent.generationConfig.responseJsonSchema.properties.redFlags).toBeDefined();
    expect(sent.generationConfig.responseJsonSchema.$schema).toBeUndefined();
  });

  it('rejects replies that do not match the schema', async () => {
    mockFetch(200, { candidates: [{ content: { parts: [{ text: '{"tldr": 5}' }] }, finishReason: 'STOP' }] });
    await expect(summarizeWithGemini('k', req, { model: 'gemini-3.8-flash', effort: 'low' })).rejects.toThrow(
      /unexpected format/,
    );
  });

  it('reports a cut-off reply', async () => {
    mockFetch(200, { candidates: [{ content: { parts: [{ text: '{"tldr":' }] }, finishReason: 'MAX_TOKENS' }] });
    await expect(summarizeWithGemini('k', req, { model: 'gemini-3.8-flash', effort: 'low' })).rejects.toThrow(/cut off/);
  });

  it('turns an invalid key into a setup error', async () => {
    mockFetch(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } });
    await expect(summarizeWithGemini('bad', req, { model: 'gemini-3.8-flash', effort: 'low' })).rejects.toBeInstanceOf(
      GeminiKeyError,
    );
  });
});
