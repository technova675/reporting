# Adbibe Growth Console

An internal console for the work Adbibe does by hand today:

- **Audits** — the free AI Marketing Audit, across ten surfaces, returning a
  prioritized fix list rather than a score.
- **Outbound** — research each lead, find one concrete thing worth saying, draft
  the email and LinkedIn message, then track the lead through the funnel.
- **Competitor intelligence** — standing watches that re-run on a cadence and
  report only what changed since the last scan.

Both used to be single-page browser prototypes that called a model API from
client-side JavaScript and lost everything on refresh. This is the same two
jobs with a real backend behind them: a persistent queue, a worker with retries,
and an operator UI that survives a closed laptop.

## Running it

```bash
npm install
cp .env.example .env.local   # add LLM_API_KEY (free, from build.nvidia.com)
npm run dev
```

Then open <http://localhost:3000> — `/` redirects to `/admin`. The public
audit page is at <http://localhost:3000/audit>. Turn the worker on
(Automation → Start worker), or queued audits wait.

Without an API key everything still loads and leads still import; jobs just sit
in the queue and the console says so.

## Models

Research runs on **open models** through any OpenAI-compatible endpoint. The
default is NVIDIA's hosted **Nemotron 3 Super** (`nvidia/nemotron-3-super-120b-a12b`)
on the free build.nvidia.com API. Change `LLM_BASE_URL` for OpenRouter, Groq,
or a local Ollama (no key needed); change the model in Settings.

Open models have no built-in web search, so this app runs searches and reads
pages itself (`lib/research/web.ts`). With no key it uses DuckDuckGo. That's
fine for trying things out, but DuckDuckGo blocks a server after a few dozen
quick queries. For real use, set `APIFY_API_TOKEN` (Apify's Google Search
scraper — the free plan's $5 monthly credit is roughly 900 searches) or
`TAVILY_API_KEY` (1,000 free searches a month). A search that fails goes into the report as
"unverified", never as "nothing exists".

## The public auditor

- `/audit`: the free-audit form for prospects. Each audit gets a shareable
  `/audit/[id]` page with live progress, then the report and a booking CTA
  (`NEXT_PUBLIC_BOOKING_URL`).
- `/auditor-standalone.html`: the same flow in one HTML file you can host on
  any site. Set `API_BASE` inside it, and allow that origin with
  `PUBLIC_AUDIT_ALLOWED_ORIGINS`.
- Guard rails: 3 audits per IP per hour, 50 a day overall, a honeypot field,
  and a block on fetching private-network addresses. The public API only
  exposes audits created through it, and never token counts or raw errors.

## Layout

```
app/
  admin/            the console — overview, outbound, audits, automation,
                    blueprint, settings
  audit/            the public free-audit page and shareable reports
  api/              the backend — leads, audits, automation control + tick
lib/
  db.ts             JSON store: one writer at a time, atomic rename on write
  types.ts          every persisted shape
  llm.ts            one entry point: researchJson() — tool loop + JSON report,
                    against any OpenAI-compatible endpoint
  research/web.ts   the tools: safe page fetch, robots/sitemap, web search
  services/
    audit.ts        the ten-surface audit prompt + schema
    prospect.ts     lead research, the hook bar, and list parsing
    competitor.ts   competitor scans, graded against the previous scan
  automation/
    engine.ts       the queue: claim, execute, retry with backoff, sweep stale
  stats.ts          dashboard aggregates
components/         UI, plus the client-side worker heartbeat
docs/
  AUTOMATION.md     how the engine works and how to scale it
  ADR-001-...md     which agents get built here vs. in n8n, and why
```

## The three rules the system is built around

**A weak hook is worse than no email.** Lead research is allowed to come back
empty. When nothing specific and verifiable turns up, the lead is parked with no
draft written and surfaces under *Needs attention*, rather than getting a
generic "do you need marketing?" that burns the domain.

**Nothing sends.** The worker researches, drafts and schedules reminders. It
never sends an email or a LinkedIn message — email needs the operator's own
mailbox connected, and automating LinkedIn outside their official API breaks
their terms. Drafts are copied out and sent by a human.

**A quiet week is a real answer.** A competitor scan that finds nothing changed
reports exactly that. Padding a quiet week with restated old facts is what turns
an intelligence service back into a report nobody reads.

## Automation

The queue is driven by `POST /api/automation/tick`. The console calls it on an
interval while work is pending; a scheduler can call the same endpoint for
unattended runs (set `ADBIBE_CRON_SECRET` first). Both are safe to run at once.

See [docs/AUTOMATION.md](docs/AUTOMATION.md), or the **Blueprint** page in the
app for the client-facing version.

## Scripts

```bash
npm run dev     # dev server
npm run build   # production build + typecheck
npm run lint    # eslint
npm run seed    # fill the store with sample leads, an audit and a competitor
                # watch, for demos — refuses to overwrite without --force
```
