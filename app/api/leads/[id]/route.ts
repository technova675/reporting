import { now, write } from "@/lib/db";
import { enqueue, nextTouchDate } from "@/lib/automation/engine";
import { LEAD_STAGES } from "@/lib/types";
import type { LeadDrafts, LeadStage } from "@/lib/types";

interface PatchBody {
  stage?: LeadStage;
  drafts?: Partial<LeadDrafts>;
  note?: string;
  /** Re-run research for this lead. */
  requeueResearch?: boolean;
}

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/leads/[id]">,
) {
  const { id } = await ctx.params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  if (body.stage && !LEAD_STAGES.includes(body.stage)) {
    return Response.json(
      { error: `Unknown stage "${body.stage}".` },
      { status: 400 },
    );
  }

  const result = await write((db) => {
    const lead = db.leads.find((l) => l.id === id);
    if (!lead) return null;

    if (body.stage && body.stage !== lead.stage) {
      const from = lead.stage;
      lead.stage = body.stage;

      // Entering the sequence schedules the next touch; leaving it clears one.
      if (body.stage === "contacted") {
        lead.sequenceStep = 0;
        lead.nextTouchAt = nextTouchDate(db, 1);
      } else if (body.stage === "follow_up") {
        lead.sequenceStep = Math.min(2, lead.sequenceStep + 1);
        lead.nextTouchAt = nextTouchDate(db, lead.sequenceStep + 1);
      } else {
        lead.nextTouchAt = null;
      }

      lead.events.push({ at: now(), type: "stage_change", from, to: body.stage });
    }

    if (body.drafts && lead.drafts) {
      lead.drafts = { ...lead.drafts, ...body.drafts };
      lead.events.push({ at: now(), type: "draft_edited" });
    }

    if (body.note?.trim()) {
      lead.events.push({ at: now(), type: "note", detail: body.note.trim() });
    }

    if (body.requeueResearch) {
      lead.error = null;
      lead.stage = "new";
      enqueue(db, "research_lead", lead.id, lead.company || lead.name);
      lead.events.push({
        at: now(),
        type: "note",
        detail: "Research re-queued.",
      });
    }

    lead.updatedAt = now();
    return lead;
  });

  if (!result) {
    return Response.json({ error: "Lead not found." }, { status: 404 });
  }
  return Response.json({ lead: result });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/leads/[id]">,
) {
  const { id } = await ctx.params;

  const removed = await write((db) => {
    const index = db.leads.findIndex((l) => l.id === id);
    if (index === -1) return false;
    db.leads.splice(index, 1);
    // Cancel anything still queued for a lead that no longer exists.
    for (const job of db.jobs) {
      if (job.subjectId === id && job.status === "queued") {
        job.status = "cancelled";
        job.finishedAt = now();
      }
    }
    return true;
  });

  if (!removed) {
    return Response.json({ error: "Lead not found." }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
