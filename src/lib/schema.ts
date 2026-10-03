import { z } from 'zod';

const Tier = z.enum(['dangerous', 'moderate', 'okay', 'whatever']);

export const PolicySummarySchema = z.object({
  tldr: z.string().describe('Two sentences max, plain language, what the user is really agreeing to.'),
  score: z
    .enum(['A', 'B', 'C', 'D', 'F'])
    .describe('Privacy grade. A = collects only what it needs. F = sells / broadly shares personal data.'),
  scoreReason: z.string().describe('One sentence justifying the grade.'),
  strictlyNecessary: z
    .array(
      z.object({
        data: z.string().describe('The data collected, e.g. "Email address".'),
        purpose: z.string().describe('Why the service needs it to work.'),
        quote: z.string().describe('Short verbatim quote from the policy supporting this. Empty string if none.'),
      }),
    )
    .describe('Data the service genuinely needs to function (account, login, security, payment, delivery).'),
  optional: z
    .array(
      z.object({
        data: z.string(),
        purpose: z.string(),
        category: z.enum(['analytics', 'personalization', 'advertising', 'other']),
        risk: Tier.describe(
          'dangerous = cross-site tracking/ads/data brokers; moderate = on-site profiling; okay = preferences; whatever = harmless.',
        ),
      }),
    )
    .describe('Data collected that is NOT required for the service to work.'),
  thirdParties: z.array(
    z.object({
      name: z.string().describe('Company or category, e.g. "Google" or "advertising partners".'),
      purpose: z.string(),
      sells: z.boolean().describe('True if the data is sold or shared for cross-context behavioral advertising.'),
      risk: Tier,
    }),
  ),
  sellsData: z.boolean().describe('True if the policy permits selling or sharing personal data for advertising.'),
  partnerCount: z.number().int().nullable().describe('Number of named ad/vendor partners if stated, else null.'),
  retention: z.string().describe('How long data is kept, in plain words. "Not stated" if absent.'),
  yourRights: z.array(z.string()).describe('Rights the user has, e.g. delete data, opt out of sale.'),
  howToOptOut: z.string().describe('Concrete steps or contact to opt out / delete data. "Not stated" if absent.'),
  redFlags: z.array(
    z.object({
      flag: z.string().describe('Plain-language concern, e.g. "Sells your data to advertisers".'),
      severity: z.enum(['low', 'med', 'high']),
      quote: z.string().describe('Exact verbatim quote from the policy that proves this flag.'),
    }),
  ),
});

export type PolicySummary = z.infer<typeof PolicySummarySchema>;

export interface StoredSummary {
  site: string;
  createdAt: number;
  policyUrls: string[];
  hash: string;
  /** True when the policy text was too long and the tail was not analyzed. */
  truncated: boolean;
  model: string;
  summary: PolicySummary;
  /** Whether each red flag's quote was found verbatim in the fetched policy text. */
  redFlagVerified: boolean[];
}
