# ADR-001: Research agents live in this repo, integration agents live in n8n

- **Status:** accepted
- **Date:** 2026-09-17
- **Applies to:** every agent in the AdVibe AI Marketing OS roadmap

## Context

The AdVibe agent roadmap lists sixteen agents. The obvious question when
building the second one — and the reason this document exists — is whether they
all belong in the same place.

Two stacks were on the table:

1. **n8n for everything.** 500+ connectors, visual workflows, built-in
   human-approval nodes, credentials management, and a scheduler. Non-engineers
   can read and edit a workflow.
2. **Owned code for everything.** This Next.js app, the job queue in
   `lib/automation/engine.ts`, the Anthropic SDK.

Picking one for all sixteen agents is wrong in both directions, because the
agents are not the same kind of thing.

## Decision

Split by where the agent's value sits.

**Research agents stay in this repo.** An agent whose output quality depends on
a prompt contract, a JSON schema, and a rule about what it is allowed to claim.
The connectors are trivial — usually just web search. The hard part is the
judgment encoded in the system prompt.

Currently: Marketing Auditor, Outbound Research, Competitor Intelligence.
Roadmap: Growth Strategist, Audience Intelligence, Content Strategy, Brand
Strategy, CRO, Marketing Consultant.

**Integration agents go in n8n.** An agent whose work is moving data between
authenticated systems on a trigger. The model call is a small step inside a lot
of plumbing, and the plumbing is where all the effort and all the breakage is.

Roadmap: WhatsApp Sales, CRM, Reporting, Lead Qualification (the CRM-writing
half), Performance Marketing, Monitoring.

**The boundary is an HTTP call.** n8n workflows call this app's API for
research; this app does not call n8n. One direction only.

## Why

**The value of a research agent is the prompt, and prompts need code review.**
The rule in `lib/services/prospect.ts` that a weak hook must return *nothing* is
the single most important line in the outbound product, and it is one sentence
in a system prompt. That belongs in version control, in a diff, with the
reviewer who understands why it is there — not in a textarea inside a workflow
node where a change leaves no trace and no one can explain a regression three
weeks later.

**The value of an integration agent is the connector, and connectors are not
worth writing.** Building and maintaining a WhatsApp Business API client, a
HubSpot sync with correct rate-limit handling, and OAuth refresh for Google Ads
is months of work that produces no differentiation. n8n has all of it, plus
credential storage and retry semantics, and its human-approval nodes are a
genuinely good fit for "do not change this budget without a person clicking
yes".

**The two kinds of agents fail differently.** A research agent fails by being
subtly wrong — a plausible finding that is not true. You catch that with prompt
review, schema constraints, and evals. An integration agent fails by being
loudly broken — an expired token, a changed webhook. You catch that with
monitoring and retries. Different failure modes want different tooling.

**Ownership follows the split.** Research agents are an engineering artefact.
Integration workflows can be maintained by whoever runs delivery, which is the
difference between a system that scales past its author and one that does not.

## Consequences

**We accept:**

- Two systems to operate instead of one.
- Some agents are genuinely split — Lead Qualification scores in this repo and
  writes to CRM in n8n. The seam has to be a clean API, or it becomes the worst
  of both.
- Research agents do not get n8n's credential vault, so anything needing client
  OAuth is pushed toward n8n by default. This is a feature, not a limitation:
  it keeps client credentials out of this codebase entirely.

**We get:**

- Every prompt that decides what a client is told lives in a reviewable diff.
- No connector maintenance for the integration surface.
- The queue in `lib/automation/engine.ts` stays small, because it only ever
  runs one shape of work: research → structured JSON → store.

## How to apply this to the next agent

Ask one question: **if this agent produced a wrong answer, would the fix be in a
prompt or in a connector?**

Prompt → this repo. Add a `JobKind`, a service in `lib/services/`, a handler in
the engine, routes, a page. Competitor Intelligence was built this way and the
engine needed no changes beyond a new case and a scheduler hook.

Connector → n8n. Have it call this app's API when it needs a research step.

If the honest answer is "both", split it at the API boundary and write down
which half is which before building either.

## Notes on the tooling

The original strategy document proposed the OpenAI Agents SDK as the AI layer.
This repo uses the Anthropic SDK, because that was the existing decision when
the console was built and because the research agents depend on the server-side
web search tool and JSON-schema structured output working together, which is
wired and tested here. This is not an argument that one provider is better; it
is a note that the provider is an implementation detail behind
`lib/anthropic.ts`, which has exactly one exported call. Swapping it is a
one-file change, and nothing above depends on the answer.
