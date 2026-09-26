import { researchJson } from "../llm";
import type { Evidence } from "../llm";
import { crawlBasics, fetchPage, normalizeUrl, webSearch } from "../research/web";
import { AUDIT_CATEGORIES } from "../types";
import type { AuditCategory, AuditInputs, Finding, Priority } from "../types";

/**
 * The free Marketing Audit: one research pass across ten surfaces, returning a
 * prioritized fix list rather than a score with no next step.
 *
 * The cheap, certain checks — reading the site, robots and sitemap, tracking
 * tags, a couple of searches — run in code before the model is involved. The
 * model spends its tool budget on the gaps, then writes the report from what
 * was observed.
 */

const CATEGORY_KEYS = AUDIT_CATEGORIES.map((c) => c.key);

const FINDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["problem", "why", "priority", "recommendation", "expected_impact", "evidence"],
  properties: {
    problem: { type: "string", description: "What is wrong or missing. One sentence." },
    why: { type: "string", description: "Why it matters commercially. One sentence." },
    priority: { type: "string", enum: ["high", "medium", "low"] },
    recommendation: { type: "string", description: "The specific fix. One sentence." },
    expected_impact: { type: "string", description: "What improves if fixed. One sentence." },
    evidence: {
      type: "string",
      description:
        "What was actually observed that supports this — a tag, a heading, a search result, with the URL. If it could not be verified, say what was checked.",
    },
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

const SYSTEM = `You are the Adbibe AI Marketing Auditor: a senior performance-marketing auditor who researches a business and reports only what the evidence supports.

Rules you never break:
- Every finding must be traceable to something in the evidence. Put that observation in the finding's "evidence" field, with the URL. If a surface cannot be verified publicly, the finding says exactly that ("the Meta Ad Library could not be read automatically; no Meta Pixel was found in the homepage HTML") instead of inventing a gap.
- Never state a number, a ranking, an ad count or a follower count that is not in the evidence. Nothing from memory or training data counts as evidence.
- Findings are specific to this business. "Improve your SEO" is a failed finding; "category pages have no meta descriptions and the H1 repeats the brand name on all six" is a real one.
- Scores are evidence-weighted, not decorative. A surface you could not verify scores between 40 and 60 with a finding that says why — never 0 and never high.
- Tracking tags found in the HTML show the business can run paid campaigns; they do not prove campaigns are live. Say which one you mean.
- Keep every field to one sentence.`;

export interface AuditOutput {
  brandName: string;
  overallScore: number;
  categories: AuditCategory[];
  topPriorities: string[];
  executiveSummary: string;
  sources: string[];
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

interface RawAudit {
  brand_name: string;
  overall_score: number;
  categories: { key: string; score: number; findings: Partial<Finding>[] }[];
  top_3_priorities: string[];
  executive_summary: string;
}

/** Step index (into AUDIT_STEPS) plus a line saying what is happening. */
export type AuditProgress = (step: number, detail: string) => void | Promise<void>;

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

What to establish:
1. Website and landing pages: what the page asks the visitor to do, how clear the offer is, and whether tracking is present.
2. SEO: title and meta quality, headings, robots/sitemap, structured data, and whether the brand shows up in search for its own name and category terms.
3. Social: which profiles exist (see social links on the site and search results), and anything visible about cadence or format.
4. Google Ads and Meta Ads: the ad libraries are JavaScript apps this system cannot read, so base these on tracking tags in the HTML and anything search surfaces, and say plainly that live campaigns were not verified.
5. Competitors: one or two real competitors (use the ones given, or find likely ones) and one concrete thing they do that this business does not.
6. Content, funnel/lead capture, conversion path and brand positioning, from what is publicly visible.

Then score each of the ten categories 0-100 and give 1-2 findings per category, each field one sentence. Finish with an overall score, the three highest-leverage priorities, and a 3-4 sentence executive summary a founder could read in twenty seconds.

Category keys, all ten required, in this order: ${CATEGORY_KEYS.join(", ")}.`;
}

/**
 * The checks that are certain and cheap. Everything here is fetched by this
 * app, so it is real evidence regardless of how capable the model is.
 */
async function gatherEvidence(
  inputs: AuditInputs,
  progress: AuditProgress,
): Promise<Evidence> {
  const evidence: Evidence = { entries: [], sources: [] };
  const add = (label: string, text: string, url?: string) => {
    evidence.entries.push({ label, text });
    if (url) evidence.sources.push(url);
  };

  const home = normalizeUrl(inputs.website);
  const host = home ? new URL(home).hostname.replace(/^www\./, "") : inputs.website;
  const brand = inputs.brand || host.split(".")[0];

  await progress(1, `Reading ${host}`);
  const homepage = await fetchPage(inputs.website);
  add("Homepage", homepage.text, homepage.ok ? homepage.url : undefined);

  // One or two inner pages where the buying decision actually happens.
  const inner = pickInnerPages(homepage.internalLinks, 2);
  for (const url of inner) {
    await progress(1, `Reading ${url.replace(/^https?:\/\//, "")}`);
    const page = await fetchPage(url);
    add(`Inner page: ${url}`, page.text, page.ok ? page.url : undefined);
  }

  await progress(2, "Checking robots.txt and sitemap");
  add("Crawlability", await crawlBasics(inputs.website));

  await progress(3, `Searching for ${brand}`);
  const brandSearch = await webSearch(`${brand}${inputs.industry ? ` ${inputs.industry}` : ""}`);
  add(`Search: ${brand}`, brandSearch.text);
  evidence.sources.push(...brandSearch.urls);

  const indexed = await webSearch(`site:${host}`);
  add(`Search: site:${host}`, indexed.text);

  if (inputs.industry) {
    await progress(3, `Checking who ranks for "${inputs.industry}"`);
    const category = await webSearch(`best ${inputs.industry} brands`);
    add(`Search: best ${inputs.industry} brands`, category.text);
    evidence.sources.push(...category.urls);
  }

  const social = [
    ...homepage.socialLinks,
    ...(inputs.social ? [`Handles given by the client: ${inputs.social}`] : []),
  ];
  add(
    "Social profiles",
    social.length
      ? `${social.join("\n")}\nProfiles on Instagram, Facebook, TikTok and LinkedIn require login to read post history, so cadence and engagement cannot be verified automatically.`
      : "No social links found on the homepage and none given by the client.",
  );

  add(
    "Ad libraries",
    `Meta Ad Library (https://www.facebook.com/ads/library/?q=${encodeURIComponent(brand)}) and Google Ads Transparency Center (https://adstransparency.google.com/?domain=${host}) are JavaScript applications this system cannot read. Live campaigns were NOT verified. Use the tracking tags found in the site HTML as the only paid-media signal, and recommend checking the libraries manually.`,
  );

  const competitors = (inputs.competitors ?? "")
    .split(/[,\n]/)
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 2);
  for (const competitor of competitors) {
    await progress(4, `Reading competitor ${competitor}`);
    const page = await fetchPage(competitor);
    add(`Competitor homepage: ${competitor}`, page.text, page.ok ? page.url : undefined);
  }

  return evidence;
}

const INNER_PAGE_HINTS =
  /(product|shop|collection|pricing|plans|services|solutions|book|contact|demo|quote|store|menu)/i;

function pickInnerPages(links: string[], limit: number): string[] {
  const scored = links
    .filter((l) => !/\.(pdf|jpg|jpeg|png|webp|svg|zip)$/i.test(l))
    .filter((l) => !/(login|account|cart|privacy|terms|policy|cookie)/i.test(l))
    .filter((l) => new URL(l).pathname !== "/")
    .map((l) => ({ url: l, score: INNER_PAGE_HINTS.test(new URL(l).pathname) ? 2 : 0 }))
    .sort((a, b) => b.score - a.score);
  return [...new Set(scored.map((s) => s.url))].slice(0, limit);
}

export async function runAudit(
  inputs: AuditInputs,
  model: string,
  progress: AuditProgress = () => undefined,
): Promise<AuditOutput> {
  const started = Date.now();
  const evidence = await gatherEvidence(inputs, progress);

  await progress(5, "Researching what the checks did not cover");
  let reportStarted = false;
  const result = await researchJson<RawAudit>({
    system: SYSTEM,
    prompt: buildAuditPrompt(inputs),
    schema: AUDIT_SCHEMA,
    model,
    // On top of the pre-gathered evidence: competitors, social, category terms.
    maxSearches: 6,
    evidence,
    onProgress: (detail) => {
      if (detail === "Writing the report") reportStarted = true;
      void progress(reportStarted ? 6 : 5, detail);
    },
  });

  return {
    brandName: result.data.brand_name?.trim() || inputs.brand || inputs.website,
    overallScore: clampScore(result.data.overall_score),
    categories: normalizeCategories(result.data.categories),
    topPriorities: (result.data.top_3_priorities ?? [])
      .filter((p) => typeof p === "string" && p.trim())
      .slice(0, 3),
    executiveSummary: result.data.executive_summary ?? "",
    sources: result.sources.slice(0, 40),
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    durationMs: Date.now() - started,
  };
}

function clampScore(n: unknown): number {
  const num = typeof n === "string" ? Number(n) : n;
  const value = typeof num === "number" && Number.isFinite(num) ? Math.round(num) : 0;
  return Math.min(100, Math.max(0, value));
}

function normalizeFinding(raw: Partial<Finding>): Finding | null {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const problem = text(raw.problem);
  if (!problem) return null;
  const priority: Priority =
    raw.priority === "high" || raw.priority === "low" ? raw.priority : "medium";
  return {
    problem,
    why: text(raw.why),
    priority,
    recommendation: text(raw.recommendation),
    expected_impact: text(raw.expected_impact),
    evidence: text(raw.evidence) || undefined,
  };
}

/**
 * The schema asks for all ten categories, but the UI renders a fixed grid, so
 * fill any gap with an explicit "not returned" finding rather than a blank card.
 */
function normalizeCategories(
  raw: RawAudit["categories"] = [],
): AuditCategory[] {
  const byKey = new Map(
    (Array.isArray(raw) ? raw : []).map((c) => [c?.key, c]),
  );
  return AUDIT_CATEGORIES.map(({ key }) => {
    const found = byKey.get(key);
    const findings = (Array.isArray(found?.findings) ? found.findings : [])
      .map(normalizeFinding)
      .filter((f): f is Finding => f !== null)
      .slice(0, 2);

    if (!found || findings.length === 0) {
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
    return { key, score: clampScore(found.score), findings };
  });
}
