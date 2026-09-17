import { researchJson } from "../anthropic";
import { SIGNAL_CATEGORIES } from "../types";
import type { Scan, Signal, Watch } from "../types";

/**
 * Competitor intelligence.
 *
 * The output that matters is not "here is what your competitors do" — that is a
 * report anyone can write once. It is "here is what changed since last week",
 * which is only possible because the previous scan is fed back in as the
 * baseline. Everything else in this file exists to make that diff trustworthy.
 */

const SIGNAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "competitor",
    "category",
    "headline",
    "detail",
    "significance",
    "evidence",
    "so_what",
    "url",
    "is_change",
  ],
  properties: {
    competitor: {
      type: "string",
      description: "The competitor domain this signal is about.",
    },
    category: { type: "string", enum: [...SIGNAL_CATEGORIES] },
    headline: {
      type: "string",
      description:
        "One alert-sized line, e.g. 'Launched a first-order discount'. No hedging.",
    },
    detail: { type: "string", description: "Two sentences at most." },
    significance: { type: "string", enum: ["high", "medium", "low"] },
    evidence: {
      type: "string",
      description:
        "What you actually observed that supports this, specific enough for a human to re-check.",
    },
    so_what: {
      type: "string",
      description:
        "What the client should consider doing about it. One sentence, concrete.",
    },
    url: {
      type: ["string", "null"],
      description: "Where it was observed, or null.",
    },
    is_change: {
      type: "boolean",
      description:
        "True only if this is new or different versus the baseline provided. False if the baseline already recorded it.",
    },
  },
} as const;

const SCAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "signals"],
  properties: {
    summary: {
      type: "string",
      description:
        "2-3 sentences on what moved since the baseline. Say plainly when nothing did.",
    },
    signals: {
      type: "array",
      maxItems: 12,
      items: SIGNAL_SCHEMA,
    },
  },
} as const;

const SYSTEM = `You are Adbibe's competitor intelligence agent. You monitor a set of competitors for one client and report what moved.

Rules you never break:
- Every signal must be grounded in something you observed on this run. Never report a change you inferred, assumed, or remember from training data.
- "is_change" is the whole product. Set it true only when the signal is new or different versus the baseline you were given. If the baseline already recorded it, the signal is still worth listing, but is_change is false.
- A quiet week is a valid, useful answer. Returning an empty signals array and a summary saying nothing moved is correct and expected — padding a quiet week with restated old facts destroys the value of the alert.
- Never report a price, an offer, or a campaign you could not see. "Pricing is not published publicly" is a finding; a guessed price is a liability.
- so_what must be an action, not an observation. "Consider matching the free-shipping threshold" is useful; "this is worth monitoring" is not.

Significance: high means it changes what the client should do this month. Medium means it is worth knowing at the next review. Low means it is noise you are recording for the trend.`;

export interface ScanOutput {
  signals: Signal[];
  summary: string;
  sources: string[];
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

interface RawSignal {
  competitor: string;
  category: string;
  headline: string;
  detail: string;
  significance: string;
  evidence: string;
  so_what: string;
  url: string | null;
  is_change: boolean;
}

interface RawScan {
  summary: string;
  signals: RawSignal[];
}

/**
 * Renders the previous scan as the baseline. Kept compact deliberately — the
 * model needs to know what was already true, not to re-read a full report.
 */
function renderBaseline(previous: Scan | null): string {
  if (!previous || previous.signals.length === 0) {
    return "BASELINE: none. This is the first scan of this watch, so record the current state. Set is_change to false on everything — there is nothing to compare against yet.";
  }

  const lines = previous.signals.map(
    (s) => `- [${s.competitor}] (${s.category}) ${s.headline} — ${s.evidence}`,
  );

  return `BASELINE — what was true at the last scan on ${new Date(
    previous.createdAt,
  ).toISOString().slice(0, 10)}:
${lines.join("\n")}

Anything above that is still true is not a change. Report it with is_change false, or leave it out if it is low significance and unchanged.`;
}

export function buildScanPrompt(watch: Watch, previous: Scan | null): string {
  return `Client: ${watch.clientName}
Competitors to check: ${watch.competitors.join(", ")}
Watch for: ${watch.focus.join(", ")}

${renderBaseline(previous)}

For each competitor, check what is publicly visible today:
1. Their homepage and main product or service pages — positioning line, headline offer, pricing if published.
2. The Meta Ad Library and Google Ads Transparency Center for that brand — are they running ads, how many creatives, what is the angle?
3. Their most recent public content or social activity, if it is visible without logging in.

Then report the signals. Lead with anything that changed. If nothing changed for a competitor, do not invent something for them.`;
}

export async function runScan(
  watch: Watch,
  previous: Scan | null,
  model: string,
): Promise<ScanOutput> {
  const result = await researchJson<RawScan>({
    system: SYSTEM,
    prompt: buildScanPrompt(watch, previous),
    schema: SCAN_SCHEMA,
    model,
    // Scales with the competitor set: roughly three lookups each.
    maxSearches: Math.min(20, Math.max(6, watch.competitors.length * 3)),
    effort: "medium",
  });

  return {
    summary: result.data.summary ?? "",
    signals: normalizeSignals(result.data.signals ?? [], watch, previous),
    sources: result.sources,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    durationMs: result.durationMs,
  };
}

function normalizeSignals(
  raw: RawSignal[],
  watch: Watch,
  previous: Scan | null,
): Signal[] {
  const isBaseline = !previous || previous.signals.length === 0;

  return raw.map((s) => ({
    competitor: s.competitor,
    category: (SIGNAL_CATEGORIES as readonly string[]).includes(s.category)
      ? (s.category as Signal["category"])
      : "other",
    headline: s.headline,
    detail: s.detail,
    significance:
      s.significance === "high" || s.significance === "low"
        ? s.significance
        : "medium",
    evidence: s.evidence,
    soWhat: s.so_what,
    url: s.url || null,
    // On a first scan nothing can be a change, whatever the model claims.
    isChange: isBaseline ? false : Boolean(s.is_change),
  }));
}

/** Parses the competitor domains a user typed into a watch. */
export function parseCompetitors(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\n]/)
        .map((v) => v.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, ""))
        .filter(Boolean)
        .map((v) => v.toLowerCase()),
    ),
  ].slice(0, 8);
}
