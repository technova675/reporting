import { PageHeader, Tag } from "@/components/ui";

export const metadata = {
  title: "Automation blueprint · Adbibe Console",
};

/**
 * The page to open in front of a client. It explains what the system actually
 * does, what it deliberately refuses to do, and what changes when this moves
 * from one operator's machine to a scheduled backend.
 */
export default function BlueprintPage() {
  return (
    <div>
      <PageHeader
        title="How the automation works"
        description="The console you are looking at is the operator view. Underneath it is a queue, a worker and a research pass — the same three pieces whether it runs for ten leads or ten thousand."
      />

      <section className="card mb-5 p-5">
        <h2 className="mb-1 text-[13px] font-semibold">The loop</h2>
        <p className="mb-5 text-[13px] text-muted">
          Everything in the system is one of these five steps. Only step four
          needs a human.
        </p>
        <PipelineDiagram />
      </section>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 text-[13px] font-semibold">What runs by itself</h2>
          <ul className="space-y-2.5 text-[13px]">
            {AUTOMATED.map((item) => (
              <li key={item.title} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ok" />
                <span>
                  <b className="font-medium">{item.title}</b>
                  <span className="block text-[12px] text-muted">
                    {item.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-[13px] font-semibold">
            What stays in your hands
          </h2>
          <ul className="space-y-2.5 text-[13px]">
            {MANUAL.map((item) => (
              <li key={item.title} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                <span>
                  <b className="font-medium">{item.title}</b>
                  <span className="block text-[12px] text-muted">
                    {item.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card mb-5 p-5">
        <h2 className="mb-1 text-[13px] font-semibold">
          The rule the research pass is built around
        </h2>
        <p className="mb-4 text-[13px] text-muted">
          The difference between outbound that books meetings and outbound that
          gets marked as spam is one thing: whether the first line proves you
          looked. So the research step is allowed to come back empty.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-ok-soft/40 p-3.5">
            <Tag tone="ok">Clears the bar</Tag>
            <p className="mt-2 text-[13px]">
              &ldquo;You&apos;ve been running Meta ads since March, but all six
              creatives in the library are the same static product shot.&rdquo;
            </p>
          </div>
          <div className="rounded-md border border-line bg-danger-soft/40 p-3.5">
            <Tag tone="danger">Rejected</Tag>
            <p className="mt-2 text-[13px]">
              &ldquo;I noticed your brand could improve its digital presence
              — do you need help with marketing?&rdquo;
            </p>
          </div>
        </div>
        <p className="mt-4 text-[13px] text-muted">
          When nothing clears the bar, the lead is parked with no draft written
          and shows up under <b className="text-ink">Needs attention</b>. Nothing
          generic ever reaches a send queue, because there is no send queue.
        </p>
      </section>

      <section className="card mb-5 p-5">
        <h2 className="mb-3 text-[13px] font-semibold">
          Running it for a thousand leads
        </h2>
        <p className="mb-4 text-[13px] text-muted">
          Nothing about the design changes with volume — the queue already
          persists across restarts and the worker already retries with backoff.
          Three things get switched on:
        </p>
        <ol className="space-y-3 text-[13px]">
          {SCALE.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="mono mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded bg-accent-soft text-[11px] font-semibold text-accent-text">
                {i + 1}
              </span>
              <span>
                <b className="font-medium">{step.title}</b>
                <span className="block text-[12px] text-muted">
                  {step.detail}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card mb-5 p-5">
        <h2 className="mb-1 text-[13px] font-semibold">Where this goes next</h2>
        <p className="mb-4 text-[13px] text-muted">
          Three agents run today. The rest of the roadmap splits cleanly in two,
          and the split decides where each one gets built.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-line bg-surface-2 p-3.5">
            <Tag tone="accent">Research agents</Tag>
            <p className="mt-2 text-[13px]">
              Value is the prompt and the rule about what it may claim. Built
              here, in code, where a change to that rule shows up in a diff.
            </p>
            <p className="mt-1.5 text-[12px] text-muted">
              Auditor · Outbound · Competitor Intel · Growth Strategist ·
              Audience · Content · Brand · CRO
            </p>
          </div>
          <div className="rounded-md border border-line bg-surface-2 p-3.5">
            <Tag tone="info">Integration agents</Tag>
            <p className="mt-2 text-[13px]">
              Value is the connector and the approval gate. Built in n8n, which
              already has WhatsApp, HubSpot, Google Ads and the credential
              handling — none of which is worth writing twice.
            </p>
            <p className="mt-1.5 text-[12px] text-muted">
              WhatsApp · CRM · Reporting · Performance · Monitoring
            </p>
          </div>
        </div>
        <p className="mt-4 text-[13px] text-muted">
          The boundary is one HTTP call: n8n asks this app for research, never
          the other way around.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-[13px] font-semibold">Cost per lead</h2>
        <p className="text-[13px] text-muted">
          A research pass is a handful of web searches plus one structured
          response — a few cents of model spend per lead at current list rates. A
          full ten-surface audit costs more because it searches harder. Live
          numbers for this workspace are on the{" "}
          <b className="text-ink">Overview</b> page; they are computed from the
          token counts each job actually reported, not estimated. A competitor
          scan scales with the size of the watch — roughly three lookups per
          competitor, per run.
        </p>
      </section>
    </div>
  );
}

const AUTOMATED = [
  {
    title: "Research",
    detail:
      "Website, socials, Meta Ad Library and Google Ads Transparency, plus one or two real competitors — per lead, with sources kept.",
  },
  {
    title: "Drafting",
    detail:
      "An email and a LinkedIn message built around the single observation the research found, mapped to one of the six services.",
  },
  {
    title: "Queueing and retries",
    detail:
      "Three attempts with exponential backoff. A rate limit is a delay, not a lost lead.",
  },
  {
    title: "Follow-up scheduling",
    detail:
      "Day 0 / 3 / 7 touches become due automatically and surface under Needs you.",
  },
  {
    title: "Audits",
    detail:
      "Ten surfaces scored with a prioritized fix list, runnable standalone or attached to a lead.",
  },
  {
    title: "Competitor watches",
    detail:
      "Standing watches re-run on a cadence and report only what changed since the last scan. A quiet week says so instead of padding.",
  },
];

const MANUAL = [
  {
    title: "Sending",
    detail:
      "Nothing leaves this system. Drafts are copied out and sent from your own mailbox.",
  },
  {
    title: "LinkedIn messages",
    detail:
      "Automating these outside LinkedIn's official API violates their terms and risks the account. Drafts only.",
  },
  {
    title: "Stage changes",
    detail:
      "Replied, interested, meeting, client — a human moves these, because only a human knows what was said.",
  },
  {
    title: "Judgment on a weak hook",
    detail:
      "When research finds nothing specific, you decide whether the lead is worth working by hand or dropping.",
  },
];

const SCALE = [
  {
    title: "Move the tick to a scheduler",
    detail:
      "POST /api/automation/tick on a cron instead of from the open browser tab. Set ADBIBE_CRON_SECRET and the endpoint authenticates.",
  },
  {
    title: "Raise concurrency against the rate limit",
    detail:
      "The worker already claims jobs atomically, so more workers is a settings change. The Anthropic rate limit is the real ceiling.",
  },
  {
    title: "Swap the JSON store for Postgres",
    detail:
      "Every read and write goes through lib/db.ts. Replacing the two functions in that file is the whole migration.",
  },
];

/** Inline SVG, sized for the content column, readable in both themes. */
function PipelineDiagram() {
  const steps = [
    { label: "Import", sub: "paste or API" },
    { label: "Research", sub: "web search" },
    { label: "Draft", sub: "hook + service" },
    { label: "Review & send", sub: "you", human: true },
    { label: "Track", sub: "funnel + follow-ups" },
  ];

  return (
    <div>
      <ol className="grid gap-2 sm:grid-cols-5">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className={`relative rounded-md border p-3 ${
              step.human
                ? "border-warn bg-warn-soft"
                : "border-line bg-surface-2"
            }`}
          >
            <div className="mono text-[10px] text-faint">0{i + 1}</div>
            <div className="mt-0.5 text-[13px] font-medium">{step.label}</div>
            <div
              className={`text-[11px] ${
                step.human ? "text-warn" : "text-muted"
              }`}
            >
              {step.sub}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[12px] text-muted">
        The amber step is the only one a person touches. Everything either side
        of it is queue work, which is why it survives a closed laptop and a
        failed request.
      </p>
    </div>
  );
}
