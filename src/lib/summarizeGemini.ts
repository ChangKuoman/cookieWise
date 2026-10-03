// Gemini summarizer: same prompt and output schema as the Claude one, via Google's Gen AI SDK.
// No browser/extension APIs in this file.
import { ApiError, FinishReason, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import {
  prepareDocuments,
  SYSTEM_PROMPT,
  userPrompt,
  type SummarizeOptions,
  type SummarizeRequest,
  type SummarizeResult,
} from './policyPrompt';
import { PolicySummarySchema } from './schema';

const THINKING: Record<SummarizeOptions['effort'], ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

const { $schema: _ignored, ...RESPONSE_SCHEMA } = z.toJSONSchema(PolicySummarySchema) as Record<string, unknown>;

export class GeminiKeyError extends Error {}

export async function summarizeWithGemini(
  apiKey: string,
  req: SummarizeRequest,
  opts: SummarizeOptions,
  signal?: AbortSignal,
): Promise<SummarizeResult> {
  const ai = new GoogleGenAI({ apiKey });
  const { body, truncated } = prepareDocuments(req.documents);

  let response;
  try {
    response = await ai.models.generateContent({
      model: opts.model,
      contents: userPrompt(req, body, truncated),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
        maxOutputTokens: 16000,
        thinkingConfig: { thinkingLevel: THINKING[opts.effort] },
        abortSignal: signal,
      },
    });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 400 && /api key/i.test(e.message)) throw new GeminiKeyError('Your Gemini API key was rejected.');
      if (e.status === 401 || e.status === 403) throw new GeminiKeyError('Your Gemini API key was rejected.');
      if (e.status === 404) throw new Error(`Gemini model "${opts.model}" was not found. Pick another model in settings.`);
      if (e.status === 429) throw new Error('Rate limited by the Gemini API (or out of free quota). Try again in a minute.');
      throw new Error(`Gemini API error ${e.status}: ${e.message}`);
    }
    throw e;
  }

  if (response.promptFeedback?.blockReason) {
    throw new Error('Gemini declined to analyze this policy.');
  }
  const finish = response.candidates?.[0]?.finishReason;
  if (finish === FinishReason.MAX_TOKENS) {
    throw new Error('The summary was cut off. Try again with a lower analysis depth.');
  }
  if (finish === FinishReason.SAFETY || finish === FinishReason.PROHIBITED_CONTENT) {
    throw new Error('Gemini declined to analyze this policy.');
  }

  const parsed = PolicySummarySchema.safeParse(safeJson(response.text));
  if (!parsed.success) {
    throw new Error('Gemini returned a summary in an unexpected format.');
  }
  return { summary: parsed.data, truncated, model: response.modelVersion ?? opts.model };
}

function safeJson(text: string | undefined): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}
