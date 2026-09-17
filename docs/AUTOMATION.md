# How the automation works

This is the engineering counterpart to the in-app **Blueprint** page. The
Blueprint page is what you show a client; this is what you read before changing
the code.

## Shape

```
POST /api/leads ──┐
POST /api/audits ─┴─> enqueue(job) ──> data/adbibe.json
                                             │
        POST /api/automation/tick ──> tick() ─┤
                                             │
                     claimJobs() ──> execute() ──> Anthropic Messages API
                                             │        (web_search + JSON schema)
                                             └──> write results back
```

There is no separate worker process. `tick()` is a function that claims due
jobs, runs them, and writes the results back. Anything that can issue an HTTP
request can drive it.

## Who calls `tick()`

1. **The open console.** `AutomationProvider` polls
   `POST /api/automation/tick` every few seconds while the queue has work, and
   every 20s when idle. This is what makes a batch visibly drain.
2. **A scheduler.** The same endpoint, hit by Vercel Cron, `crontab`, or
   anything else. Set `ADBIBE_CRON_SECRET` and the route requires it as
   `Authorization: Bearer <secret>` or `x-cron-secret`.

Both paths are safe to run at once. Jobs are claimed inside the store's write
lock, and `tick()` refuses to start while one pass is still in flight, so a job
is only ever executed by one caller.

## Job lifecycle

```
queued ──claim──> running ──ok──> succeeded
   ▲                  │
   └──backoff─────────┴──error──> (attempts < 3) queued
                                  (attempts = 3) failed
```

- 3 attempts, exponential backoff from 15s, capped at 10 minutes.
- A rate limit or a transient API error is a delay, not a lost lead.
- On final failure the error is written onto the lead or audit itself, not just
  the job, so it shows up where the operator is actually looking.
- Every attempt appends to the job's log, capped at the last 40 lines.

## Job kinds

| Kind | What it does | Ends in |
|---|---|---|
| `research_lead` | Web research + drafting for one lead | `drafted`, or `new` when no hook cleared the bar |
| `run_audit` | Ten-surface audit for one website | Audit `complete` |
| `advance_sequence` | Marks the next follow-up due | Lead `follow_up` |

## What the engine will not do

It does not send. There is no mail transport and no LinkedIn client in this
codebase, deliberately:

- Email needs the operator's own mailbox connected, and sending from a shared
  domain on someone else's behalf is a deliverability decision, not a feature
  flag.
- Automating LinkedIn messages outside their official (heavily restricted) API
  violates their terms and risks the account.

`AutomationSettings.autoSendEnabled` is typed as the literal `false` and is not
patchable through the API, so turning it on is a code change that has to be
reviewed, not a toggle someone flips at 11pm.

## Storage

`lib/db.ts` is the whole persistence layer: a JSON file, one writer at a time
via a promise chain, written to a temp file and renamed so a crash cannot leave
a truncated store behind.

Swapping to Postgres means replacing `read()` and `write()` in that one file.
Every route and the engine go through them; nothing else touches the disk.

Set `ADBIBE_DATA_DIR` to move the store somewhere other than `./data`.

## Cost

Each job reports the token counts the API returned; audits accumulate them on
the record. The Overview page multiplies those by Opus 5 list rates. That number
is a sanity check against your Anthropic console, not a bill.

Lead research runs at `medium` effort with up to 8 searches. Audits run at
`high` with up to 12, because they cover ten surfaces including two ad
transparency libraries.

## Scaling past one operator

1. Move ticking to a scheduler (above).
2. Raise `concurrency` in Settings. The ceiling is your Anthropic rate limit,
   not this code — above ~4 concurrent research passes you start burning
   attempts on 429s.
3. Replace the store with Postgres (above). At that point `claimJobs` should
   become `SELECT ... FOR UPDATE SKIP LOCKED` so several machines can share the
   queue.

Nothing else changes. The queue already persists across restarts, and a job left
`running` by a process that died is swept back into the queue by the next pass
once it has been stuck for 15 minutes (`STALE_AFTER_MS`), so a restart mid-batch
costs one retry rather than a lost lead.
