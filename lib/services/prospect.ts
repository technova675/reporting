import { researchJson } from "../anthropic";
import { SERVICES } from "../types";
import type { Lead, LeadDrafts, LeadResearch } from "../types";

/**
 * Outbound research + drafting.
 *
 * The whole point of this step is the hook: one concrete, checkable observation
 * about this specific business. If the research can't produce one, the lead is
 * marked as having no hook rather than getting a generic pitch — a bad cold
 * email costs more than no cold email.
 */

const PROSPECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "found_hook",
    "research_summary",
    "hook",
    "recommended_service",
    "email_subject",
    "email_body",
    "linkedin_message",
  ],
  properties: {
    found_hook: {
      type: "boolean",
      description:
        "False if no specific, verifiable observation could be found. Never invent one to make this true.",
    },
    research_summary: {
      type: "string",
      description:
        "2-3 sentences: what the business does and the specific gap found, or why none could be found.",
    },
    hook: {
      type: "string",
      description:
        "The single concrete observation the outreach opens with. Empty string when found_hook is false.",
    },
    recommended_service: { type: "string", enum: [...SERVICES] },
    email_subject: { type: "string" },
    email_body: {
      type: "string",
      description:
        "3-5 sentences opening with the observation. Empty string when found_hook is false.",
    },
    linkedin_message: {
      type: "string",
      description: "2-3 sentences. Empty string when found_hook is false.",
    },
  },
} as const;

const SYSTEM = `You are Adbibe's outbound research agent. Adbibe is a founder-led AI performance marketing agency in Bangalore selling exactly six services: Performance Marketing, Programmatic Marketing, AI Automation, Social Media Marketing, Brand Strategy, Marketing Consulting.

The bar for a hook, non-negotiable:
- GOOD: "running Meta ads since March but all six creatives in the library are the same static product shot"; "Instagram posts 4x a week and gets real comments, but nothing is being amplified with paid"; "checkout page loads a Shopify default with no pixel visible in the page source".
- BAD: "could improve digital presence"; "might benefit from better marketing"; "your competitors are ahead". Anything that could be pasted into a hundred other emails is a failure.

If the research does not surface a GOOD hook, set found_hook to false, explain in research_summary what you checked and what you could not confirm, and leave the message fields as empty strings. Do not soften a weak finding into a strong claim. Never state a metric you did not observe.

Writing rules: no "I hope this finds you well", no "we are a marketing agency", no flattery, no three-paragraph pitch. Open with the observation, connect it to one service, ask one low-friction question. Write the way a founder writes to another founder.`;

export interface ProspectOutput {
  research: LeadResearch;
  drafts: LeadDrafts | null;
  foundHook: boolean;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

interface RawProspect {
  found_hook: boolean;
  research_summary: string;
  hook: string;
  recommended_service: string;
  email_subject: string;
  email_body: string;
  linkedin_message: string;
}

export function buildProspectPrompt(lead: Lead): string {
  const known = [
    `Name: ${lead.name}`,
    lead.company && `Company: ${lead.company}`,
    lead.website && `Website: ${lead.website}`,
    lead.linkedin && `LinkedIn: ${lead.linkedin}`,
  ].filter(Boolean);

  return `Research this lead, then draft outreach.

${known.join("\n")}

Check, in order, stopping once you have a hook strong enough to clear the bar:
1. The website — what they sell, who to, and what the site asks a visitor to do. Look for a visible tracking pixel, a lead capture, and how the offer is framed.
2. Their Instagram and LinkedIn — posting cadence, engagement, format mix.
3. Meta Ad Library and Google Ads Transparency Center — are they running paid, since when, and how much creative variation is in the library?

Then pick the ONE Adbibe service that most directly addresses what you found, and write the email and the LinkedIn message around that single observation.`;
}

export async function researchLead(
  lead: Lead,
  model: string,
): Promise<ProspectOutput> {
  const result = await researchJson<RawProspect>({
    system: SYSTEM,
    prompt: buildProspectPrompt(lead),
    schema: PROSPECT_SCHEMA,
    model,
    maxSearches: 8,
    effort: "medium",
  });

  const raw = result.data;
  const foundHook = Boolean(raw.found_hook && raw.hook?.trim());

  return {
    foundHook,
    research: {
      summary: raw.research_summary ?? "",
      service: raw.recommended_service ?? "Marketing Consulting",
      hook: raw.hook?.trim() ?? "",
      sources: result.sources,
    },
    drafts: foundHook
      ? {
          emailSubject: raw.email_subject ?? "",
          emailBody: raw.email_body ?? "",
          linkedinMessage: raw.linkedin_message ?? "",
        }
      : null,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    durationMs: result.durationMs,
  };
}

/** Parses the pasted CSV-ish lead list into partial leads. */
export function parseLeadList(raw: string): {
  rows: Omit<Lead, "id" | "createdAt" | "updatedAt" | "stage" | "sequenceStep" | "nextTouchAt" | "research" | "drafts" | "auditId" | "error" | "owner" | "tags" | "events">[];
  errors: string[];
} {
  const rows: ReturnType<typeof parseLeadList>["rows"] = [];
  const errors: string[] = [];

  raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line, i) => {
      // Skip a header row if someone pasted one straight out of a sheet.
      if (i === 0 && /^name\s*,/i.test(line)) return;

      const parts = line.split(",").map((p) => p.trim());
      const [name, company, website, email, linkedin] = parts;
      if (!name) {
        errors.push(`Line ${i + 1}: no name — skipped.`);
        return;
      }
      if (!website && !linkedin) {
        errors.push(
          `Line ${i + 1} (${name}): no website or LinkedIn, nothing to research — skipped.`,
        );
        return;
      }
      rows.push({
        name,
        company: company ?? "",
        website: normalizeUrl(website ?? ""),
        email: email ?? "",
        linkedin: linkedin ?? "",
      });
    });

  return { rows, errors };
}

function normalizeUrl(value: string): string {
  if (!value) return "";
  return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
