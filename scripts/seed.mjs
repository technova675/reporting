/**
 * Fills the store with a worked example: leads spread across the funnel, one
 * finished audit, and a run log that looks like a batch that actually ran.
 *
 * This exists so the console can be demoed, and so the layout can be worked on,
 * without spending API credit. It refuses to run over an existing store unless
 * you pass --force.
 *
 *   node scripts/seed.mjs [--force]
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DATA_DIR = process.env.ADBIBE_DATA_DIR
  ? path.resolve(process.env.ADBIBE_DATA_DIR)
  : path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "adbibe.json");

const force = process.argv.includes("--force");

const id = (prefix) => `${prefix}_${randomUUID().slice(0, 8)}`;
const ago = (mins) => new Date(Date.now() - mins * 60_000).toISOString();
const ahead = (days) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

const LEADS = [
  {
    name: "Priya Sharma",
    company: "Nova Skincare",
    website: "novaskincare.in",
    email: "priya@novaskincare.in",
    linkedin: "linkedin.com/in/priyasharma",
    stage: "drafted",
    service: "Performance Marketing",
    hook: "Running Meta ads since March, but all six creatives in the library are the same static product shot on the same background.",
    summary:
      "D2C skincare selling four SKUs direct, mostly via Instagram. Active in the Meta Ad Library with six ads, all variations of one static product shot — no UGC, no video, no offer testing.",
    subject: "Six ads, one creative",
    body: "Priya — your Meta library has six active ads and all six are the same static bottle shot on the same cream background. That's usually what a plateau in CPA looks like from the outside: the audience is fine, the creative has nothing left to say to it.\n\nWe run creative testing as the main lever rather than an afterthought — UGC, founder video, offer framing — against the same spend.\n\nWorth fifteen minutes to look at what your CPA has done since March?",
    linkedinMessage:
      "Priya — noticed Nova has six ads live on Meta and they're all the same static product shot. Creative variation is usually the cheapest CPA win available at that point. Open to a quick look at your numbers since March?",
  },
  {
    name: "Rahul Mehta",
    company: "Fitly App",
    website: "fitlyapp.com",
    email: "rahul@fitlyapp.com",
    linkedin: "linkedin.com/in/rahulmehta",
    stage: "contacted",
    sequenceStep: 0,
    nextTouch: 2,
    service: "AI Automation",
    hook: "The signup flow asks for a phone number before showing anything, and there is no visible analytics or pixel in the page source.",
    summary:
      "Fitness tracking app, freemium. Landing page gates the product behind a phone-number signup, and the page source shows no analytics or ad pixel — so nothing being spent on acquisition can currently be attributed.",
    subject: "You can't see where your signups come from",
    body: "Rahul — I went through Fitly's signup and two things stood out. The flow asks for a phone number before showing anything of the product, and the page source has no pixel or analytics on it at all.\n\nThe second one is the expensive one: any acquisition spend right now is unattributable, so you can't tell a good channel from a bad one.\n\nWe fix tracking and attribution as step one, before touching spend. Fifteen minutes this week?",
    linkedinMessage:
      "Rahul — Fitly's landing page has no pixel or analytics in the source, which means any acquisition spend is currently unattributable. That's usually a same-week fix. Worth a quick call?",
  },
  {
    name: "Ananya Rao",
    company: "Bloom Bakes",
    website: "bloombakes.in",
    email: "ananya@bloombakes.in",
    linkedin: "linkedin.com/in/ananyarao",
    stage: "replied",
    sequenceStep: 1,
    service: "Social Media Marketing",
    hook: "Posting to Instagram four times a week with real comments on every post, and running zero paid amplification behind any of it.",
    summary:
      "Home bakery in Bangalore with genuine organic traction — four posts a week, consistent comments, a visible repeat-customer base. Nothing in the Meta Ad Library: none of it is being amplified.",
    subject: "Your organic posts are doing the hard part already",
    body: "Ananya — Bloom Bakes posts four times a week and actually gets comments, which is the part most brands pay agencies to fake. There's nothing in your Meta Ad Library though, so none of it is being put behind spend.\n\nAmplifying posts that already earned engagement is the cheapest paid social there is — the creative is proven before a rupee is spent.\n\nCan I show you which three posts I'd start with?",
    linkedinMessage:
      "Ananya — Bloom Bakes gets real engagement organically and isn't amplifying any of it. Putting spend behind posts that already worked is the cheapest paid social available. Want me to show you which ones I'd start with?",
  },
  {
    name: "Karan Desai",
    company: "Sunder Interiors",
    website: "sunderinteriors.com",
    email: "karan@sunderinteriors.com",
    linkedin: "linkedin.com/in/karandesai",
    stage: "meeting",
    sequenceStep: 2,
    service: "Brand Strategy",
    hook: "The site positions on 'affordable luxury' while every case study shown is a ₹40L+ full-home project.",
    summary:
      "Interior design studio. The homepage leads with affordability, but every project in the portfolio is a high-end full-home fitout — the positioning and the proof are arguing with each other, which shows up as unqualified enquiries.",
    subject: "Your site and your portfolio disagree",
    body: "Karan — Sunder's homepage leads with 'affordable luxury', but every case study below it is a ₹40L+ full-home fitout.\n\nThat gap usually shows up as enquiry volume that looks healthy and a close rate that doesn't, because the leads arriving are priced for a different studio.\n\nHappy to walk through what re-anchoring the positioning would do to your lead quality.",
    linkedinMessage:
      "Karan — Sunder's homepage says 'affordable luxury' but the portfolio is all ₹40L+ fitouts. That mismatch usually shows up as unqualified enquiries. Worth a conversation?",
  },
  {
    name: "Meera Nair",
    company: "Tolly Coffee",
    website: "tollycoffee.in",
    email: "meera@tollycoffee.in",
    linkedin: "linkedin.com/in/meeranair",
    stage: "new",
    service: "Marketing Consulting",
    hook: "",
    summary:
      "Small-batch coffee roaster. Site is a single Shopify page, no Instagram found under the handle given, nothing in either ad library, and no press coverage. Nothing specific and verifiable to lead with — this one needs a human to look before it is worth contacting.",
    subject: "",
    body: "",
    linkedinMessage: "",
  },
];

const AUDIT_FINDINGS = {
  website: [
    {
      problem:
        "The homepage hero shows a product image with no price, no shipping terms and no primary call to action above the fold.",
      why: "First-time visitors from paid traffic decide within a few seconds, and there is nothing for them to act on.",
      priority: "high",
      recommendation:
        "Put price, shipping promise and a single Add to Cart above the fold.",
      expected_impact: "Higher add-to-cart rate on the same paid traffic.",
    },
  ],
  seo: [
    {
      problem:
        "All six collection pages share one meta description and the H1 is the brand name on each.",
      why: "Google has nothing to differentiate the pages, so they compete with each other for the same terms.",
      priority: "medium",
      recommendation:
        "Write a distinct H1 and meta description per collection, keyed to the category term.",
      expected_impact: "Category pages start ranking separately instead of cannibalising.",
    },
  ],
  social: [
    {
      problem:
        "Instagram posts three times a week but every post is a product shot with no face or process content.",
      why: "Format monotony caps reach, and the content that converts in this category is process and founder content.",
      priority: "medium",
      recommendation: "Add one process or founder post per week and measure reach against the product posts.",
      expected_impact: "Reach per post rises without increasing posting volume.",
    },
  ],
  google_ads: [
    {
      problem:
        "No entries appear for this domain in the Google Ads Transparency Center.",
      why: "Branded search is unprotected, so competitors can bid on the brand name unopposed.",
      priority: "medium",
      recommendation:
        "Start with a small branded-search campaign before any prospecting spend.",
      expected_impact: "Branded traffic stops leaking to competitors, at low cost.",
    },
  ],
  meta_ads: [
    {
      problem:
        "Six ads are active in the Meta Ad Library and all six use the same static product image.",
      why: "Creative is the main lever on Meta performance, and there is currently only one creative idea in market.",
      priority: "high",
      recommendation:
        "Run three distinct creative concepts — UGC, founder video, offer-led — against the same audience.",
      expected_impact: "Lower CPA from creative variation before any budget change.",
    },
  ],
  competitors: [
    {
      problem:
        "The two closest competitors both run video ads and a first-order discount; this brand runs neither.",
      why: "The category's buyers are being trained on an offer this brand does not match.",
      priority: "medium",
      recommendation: "Test one first-order offer against the current no-offer control.",
      expected_impact: "Clear read on whether the offer gap is costing first purchases.",
    },
  ],
  content: [
    {
      problem: "The blog has four posts, the most recent from fourteen months ago.",
      why: "Stale content signals abandonment to both visitors and search.",
      priority: "low",
      recommendation:
        "Either commit to a monthly cadence or remove the blog from the navigation.",
      expected_impact: "Removes a trust leak at effectively no cost.",
    },
  ],
  funnel_leadgen: [
    {
      problem: "There is no email capture anywhere on the site except checkout.",
      why: "Paid traffic that does not buy on the first visit is lost entirely.",
      priority: "high",
      recommendation: "Add a single email capture with a first-order incentive.",
      expected_impact: "Non-converting paid traffic becomes retargetable and emailable.",
    },
  ],
  conversion_rate: [
    {
      problem: "Checkout asks for account creation before it shows shipping cost.",
      why: "Both are established drop-off points, and this page has them stacked.",
      priority: "high",
      recommendation: "Enable guest checkout and surface shipping cost on the cart page.",
      expected_impact: "Fewer abandoned carts on traffic already paid for.",
    },
  ],
  brand_positioning: [
    {
      problem:
        "The site describes the product by ingredient list; no line says who it is for.",
      why: "In a crowded category, the buyer has to place themselves in the product, and nothing here helps them.",
      priority: "medium",
      recommendation:
        "Write one positioning line naming the specific buyer and occasion, and lead with it.",
      expected_impact: "Higher engaged-session rate as the right visitors self-identify faster.",
    },
  ],
};

const SCORES = {
  website: 52,
  seo: 41,
  social: 63,
  google_ads: 35,
  meta_ads: 44,
  competitors: 55,
  content: 38,
  funnel_leadgen: 30,
  conversion_rate: 34,
  brand_positioning: 48,
};

function buildLead(spec, index) {
  const leadId = id("lead");
  const createdAt = ago(600 - index * 90);
  const hasHook = Boolean(spec.hook);

  const events = [{ at: createdAt, type: "created" }];
  events.push({ at: ago(560 - index * 90), type: "research_started" });
  events.push({
    at: ago(555 - index * 90),
    type: "research_complete",
    detail: hasHook
      ? `Hook: ${spec.hook}`
      : "No specific hook found; no drafts written.",
  });
  if (["contacted", "replied", "meeting"].includes(spec.stage)) {
    events.push({
      at: ago(400 - index * 60),
      type: "stage_change",
      from: "drafted",
      to: "contacted",
    });
  }
  if (["replied", "meeting"].includes(spec.stage)) {
    events.push({
      at: ago(200 - index * 40),
      type: "stage_change",
      from: "contacted",
      to: "replied",
      detail: "Replied asking what the first month would look like.",
    });
  }
  if (spec.stage === "meeting") {
    events.push({
      at: ago(60),
      type: "stage_change",
      from: "interested",
      to: "meeting",
      detail: "Call booked for Thursday.",
    });
  }

  return {
    id: leadId,
    createdAt,
    updatedAt: ago(40 - index * 5),
    name: spec.name,
    company: spec.company,
    website: spec.website,
    email: spec.email,
    linkedin: spec.linkedin,
    stage: spec.stage,
    sequenceStep: spec.sequenceStep ?? 0,
    nextTouchAt: spec.nextTouch ? ahead(spec.nextTouch) : null,
    research: {
      summary: spec.summary,
      service: spec.service,
      hook: spec.hook,
      sources: hasHook
        ? [
            `https://${spec.website}`,
            "https://www.facebook.com/ads/library/",
            `https://www.instagram.com/${spec.company.toLowerCase().replace(/\s+/g, "")}/`,
          ]
        : [`https://${spec.website}`],
    },
    drafts: hasHook
      ? {
          emailSubject: spec.subject,
          emailBody: spec.body,
          linkedinMessage: spec.linkedinMessage,
        }
      : null,
    auditId: null,
    error: null,
    owner: "krishna",
    tags: [],
    events,
  };
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  if (!force) {
    try {
      const existing = JSON.parse(await fs.readFile(DB_PATH, "utf8"));
      if (existing.leads?.length || existing.audits?.length) {
        console.error(
          `Refusing to overwrite ${DB_PATH} — it already has ${existing.leads.length} leads and ${existing.audits.length} audits.\nPass --force if you meant to replace them.`,
        );
        process.exit(1);
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  const leads = LEADS.map(buildLead);

  const auditId = id("audit");
  const audit = {
    id: auditId,
    createdAt: ago(180),
    updatedAt: ago(176),
    status: "complete",
    inputs: {
      website: "novaskincare.in",
      brand: "Nova Skincare",
      industry: "D2C skincare",
      social: "@novaskincare",
      competitors: "minimalistbeauty.in, dotandkey.com",
    },
    brandName: "Nova Skincare",
    overallScore: 44,
    categories: Object.entries(SCORES).map(([key, score]) => ({
      key,
      score,
      findings: AUDIT_FINDINGS[key],
    })),
    topPriorities: [
      "Add email capture — paid traffic that does not buy today is currently lost entirely.",
      "Enable guest checkout and show shipping cost before account creation.",
      "Get three genuinely different creative concepts into the Meta account.",
    ],
    executiveSummary:
      "Nova has a working product page and real organic interest, but the money leaks at two points: there is no email capture outside checkout, and checkout itself asks for an account before showing shipping. Paid spend is going into a funnel that cannot hold anyone who does not buy on the first visit. Fixing capture and checkout costs a week and changes what every rupee of ad spend is worth; the creative work on Meta is the next lever after that.",
    error: null,
    leadId: leads[0].id,
    tokensIn: 48219,
    tokensOut: 3104,
    durationMs: 141_000,
  };
  leads[0].auditId = auditId;

  const jobs = [
    ...leads.map((lead, i) => ({
      id: id("job"),
      kind: "research_lead",
      status: "succeeded",
      subjectId: lead.id,
      subjectLabel: lead.company,
      createdAt: ago(600 - i * 90),
      startedAt: ago(560 - i * 90),
      finishedAt: ago(555 - i * 90),
      attempts: i === 3 ? 2 : 1,
      maxAttempts: 3,
      runAfter: ago(600 - i * 90),
      error: null,
      batchId: null,
      log: [
        { at: ago(600 - i * 90), level: "info", message: `Queued research_lead for ${lead.company}.` },
        ...(i === 3
          ? [
              {
                at: ago(575 - i * 90),
                level: "warn",
                message:
                  "Rate limited by the Anthropic API — this job will be retried. Retrying in 15s.",
              },
            ]
          : []),
        { at: ago(560 - i * 90), level: "info", message: `Researching ${lead.company}.` },
        {
          at: ago(556 - i * 90),
          level: lead.research.hook ? "info" : "warn",
          message: lead.research.hook
            ? `Hook found — recommending ${lead.research.service}.`
            : "No hook cleared the bar — left undrafted for manual review.",
        },
        { at: ago(555 - i * 90), level: "info", message: "Completed." },
      ],
    })),
    {
      id: id("job"),
      kind: "run_audit",
      status: "succeeded",
      subjectId: auditId,
      subjectLabel: "Nova Skincare",
      createdAt: ago(180),
      startedAt: ago(179),
      finishedAt: ago(176),
      attempts: 1,
      maxAttempts: 3,
      runAfter: ago(180),
      error: null,
      batchId: null,
      log: [
        { at: ago(180), level: "info", message: "Queued run_audit for Nova Skincare." },
        { at: ago(179), level: "info", message: "Auditing novaskincare.in." },
        { at: ago(176), level: "info", message: "Scored 44/100." },
        { at: ago(176), level: "info", message: "Completed." },
      ],
    },
  ];

  const db = {
    version: 3,
    leads,
    audits: [audit],
    jobs,
    batches: [],
    settings: {
      enabled: false,
      concurrency: 2,
      tickIntervalSec: 5,
      sequenceDelaysDays: [0, 3, 7],
      autoSendEnabled: false,
      dailyLeadCap: 40,
      model: "claude-opus-5",
    },
  };

  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf8");
  console.log(
    `Seeded ${leads.length} leads, 1 audit and ${jobs.length} jobs into ${DB_PATH}.`,
  );
  console.log("The worker is left paused — start it from the Automation page.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
