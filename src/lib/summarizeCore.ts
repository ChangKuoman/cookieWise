// Claude summarizer. Shared between the extension (Claude mode) and the proxy worker.
// No browser/extension APIs in this file.
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  prepareDocuments,
  SYSTEM_PROMPT,
  userPrompt,
  type SummarizeOptions,
  type SummarizeRequest,
  type SummarizeResult,
} from './policyPrompt';
import { PolicySummarySchema } from './schema';

export type { SummarizeRequest } from './policyPrompt';

export async function summarizeWithClaude(
  client: Anthropic,
  req: SummarizeRequest,
  opts: SummarizeOptions,
  signal?: AbortSignal,
): Promise<SummarizeResult> {
  const { body, truncated } = prepareDocuments(req.documents);
  const response = await client.beta.messages.parse({
    model: opts.model,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    output_config: { effort: opts.effort, format: betaZodOutputFormat(PolicySummarySchema) },
    messages: [{ role: 'user', content: userPrompt(req, body, truncated) }],
  }, { signal });

  if (response.stop_reason === 'refusal') {
    throw new Error('The AI declined to analyze this policy.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('The summary was cut off. Try again with a lower effort setting.');
  }
  if (!response.parsed_output) {
    throw new Error('The AI returned a summary in an unexpected format.');
  }
  return { summary: response.parsed_output, truncated, model: response.model };
}
