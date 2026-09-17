import { researchJson } from "../anthropic";
import { AUDIT_CATEGORIES } from "../types";
import type { AuditCategory, AuditInputs, Finding, Priority } from "../types";

/**
 * The free Marketing Audit: one research pass across ten surfaces, returning a
 * prioritized fix list rather than a score with no next step.
 */

const CATEGORY_KEYS = AUDIT_CATEGORIES.map((c) => c.key);

const FINDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["problem", "why", "priority", "recommendation", "expected_impact"],
  properties: {
    problem: { type: "string", description: "What is wrong or missing. One sentence." },
    why: { type: "string", description: "Why it matters commercially. One sentence." },
    priority: { type: "string", enum: ["high", "medium", "low"] },
    recommendation: { type: "string", description: "The specific fix. One sentence." },
    expected_impact: { type: "string", description: "What improves if fixed. One sentence." },
  },
} as const;

const AUDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "brand_name",
    "overall_score",
    "categories",
    "top_3_priorities",
    "executive_summary",
  ],
  properties: {
    brand_name: { type: "string" },
    overall_score: { type: "integer", minimum: 0, maximum: 100 },
    categories: {
      type: "array",
      minItems: 10,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "score", "findings"],
        properties: {
          key: { type: "string", enum: CATEGORY_KEYS },
          score: { type: "integer", minimum: 0, maximum: 100 },
          findings: {
            type: "array",
            minItems: 1,
            maxItems: 2,
            items: FINDING_SCHEMA,
          },
        },
      },
    },
    top_3_priorities: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string" },
    },
    executive_summary: { type: "string" },
  },
} as const;

const SYSTEM = `You are the Adbibe AI Marketing Auditor: a senior performance-marketing auditor who researches a business with web search and reports only what the evidence supports.

Rules you never break:
- Every finding must be traceable to something you actually observed. If a surface cannot be verified publicly, the finding says exactly that ("no Meta Ad Library entries found for this page as of today") instead of inventing a gap.
- Findings are specific to this business. "Improve your SEO" is a failed finding; "category pages have no meta descriptions and the H1 repeats the brand name on all six" is a real one.
- Scores are evidence-weighted, not decorative. A surface you could not verify scores in the middle with a finding that says why, not zero.
- Keep every field to one sentence.`;

export interface AuditOutput {
  brandName: string;
  overallScore: number;
  categories: AuditCategory[];
  topPriorities: string[];
  executiveSummary: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

interface RawAudit {
  brand_name: string;
  overall_score: number;
  categories: { key: string; score: number; findings: Finding[] }[];
  top_3_priorities: string[];
  executive_summary: string;
}

export function buildAuditPrompt(inputs: AuditInputs): string {
  const lines = [
    `Website: ${inputs.website}`,
    inputs.brand && `Business name: ${inputs.brand}`,
    inputs.industry && `Industry: ${inputs.industry}`,
    inputs.social && `Social handles: ${inputs.social}`,
    inputs.competitors && `Competitors to check: ${inputs.competitors}`,
    inputs.context && `Additional context from the client: ${inputs.context}`,
  ].filter(Boolean);

  return `Audit this business across all ten marketing surfaces.

${lines.join("\n")}

Research steps:
1. Open the website and at least one landing or product page. Note what the page asks the visitor to do and whether tracking is visibly present.
2. Check organic search presence: indexed pages, title/meta quality, whether the brand ranks for its own category terms.
3. Check the social handles given (or find them). Look at posting cadence, format mix, and whether organic content is being amplified with paid.
4. Check Meta Ad Library and Google Ads Transparency Center for active ads on this brand. Report what you find, including finding nothing.
5. Identify one or two real competitors and note one concrete thing they do that this business does not.
6. Assess content, funnel/lead capture, conversion path, and brand positioning from what is publicly visible.

Then score each of the ten categories 0-100 and give 1-2 findings per category, each one sentence per field. Finish with an overall score, the three highest-leverage priorities, and a 3-4 sentence executive summary a founder could read in twenty seconds.

Category keys, all ten required: ${CATEGORY_KEYS.join(", ")}.`;
}

export async function runAudit(
  inputs: AuditInputs,
  model: string,
): Promise<AuditOutput> {
  const result = await researchJson<RawAudit>({
    system: SYSTEM,
    prompt: buildAuditPrompt(inputs),
    schema: AUDIT_SCHEMA,
    model,
    maxSearches: 12,
    effort: "high",
  });

  return {
    brandName: result.data.brand_name?.trim() || inputs.brand || inputs.website,
    overallScore: clampScore(result.data.overall_score),
    categories: normalizeCategories(result.data.categories),
    topPriorities: (result.data.top_3_priorities ?? []).slice(0, 3),
    executiveSummary: result.data.executive_summary ?? "",
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    durationMs: result.durationMs,
  };
}

function clampScore(n: unknown): number {
  const value = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * The schema asks for all ten categories, but the UI renders a fixed grid, so
 * fill any gap with an explicit "not returned" finding rather than a blank card.
 */
function normalizeCategories(
  raw: { key: string; score: number; findings: Finding[] }[] = [],
): AuditCategory[] {
  const byKey = new Map(raw.map((c) => [c.key, c]));
  return AUDIT_CATEGORIES.map(({ key }) => {
    const found = byKey.get(key);
    if (!found) {
      return {
        key,
        score: 50,
        findings: [
          {
            problem: "This surface was not returned by the research pass.",
            why: "An unaudited surface can hide the cheapest win on the list.",
            priority: "medium" as Priority,
            recommendation: "Re-run the audit, or review this surface manually.",
            expected_impact: "Completes the picture before spend is committed.",
          },
        ],
      };
    }
    return {
      key,
      score: clampScore(found.score),
      findings: (found.findings ?? []).slice(0, 2),
    };
  });
}
