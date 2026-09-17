import { newId, now, read, write } from "@/lib/db";
import { enqueue } from "@/lib/automation/engine";
import { parseLeadList } from "@/lib/services/prospect";
import type { Lead } from "@/lib/types";

export async function GET() {
  const db = await read();
  return Response.json({ leads: db.leads });
}

interface CreateBody {
  raw?: string;
  owner?: string;
  tags?: string[];
  /** Queue research immediately. Defaults to true. */
  autoResearch?: boolean;
}

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const raw = (body.raw ?? "").trim();
  if (!raw) {
    return Response.json(
      { error: "Paste at least one lead before importing." },
      { status: 400 },
    );
  }

  const { rows, errors } = parseLeadList(raw);
  if (rows.length === 0) {
    return Response.json(
      { error: "No usable leads in that list.", warnings: errors },
      { status: 400 },
    );
  }

  const result = await write((db) => {
    // De-duplicate against what is already in the pipeline so a re-paste of an
    // overlapping list doesn't double-research and double-email anyone.
    const seen = new Set(
      db.leads.map((l) => dedupeKey(l.email, l.website, l.name)),
    );
    const duplicates: string[] = [];
    const created: Lead[] = [];

    for (const row of rows) {
      const key = dedupeKey(row.email, row.website, row.name);
      if (seen.has(key)) {
        duplicates.push(row.name);
        continue;
      }
      seen.add(key);

      const lead: Lead = {
        id: newId("lead"),
        createdAt: now(),
        updatedAt: now(),
        ...row,
        stage: "new",
        sequenceStep: 0,
        nextTouchAt: null,
        research: null,
        drafts: null,
        auditId: null,
        error: null,
        owner: body.owner?.trim() || "unassigned",
        tags: body.tags ?? [],
        events: [{ at: now(), type: "created" }],
      };
      db.leads.unshift(lead);
      created.push(lead);
    }

    const batchId = newId("batch");
    if (body.autoResearch !== false && created.length > 0) {
      for (const lead of created) {
        enqueue(
          db,
          "research_lead",
          lead.id,
          lead.company || lead.name,
          batchId,
        );
      }
      db.batches.unshift({
        id: batchId,
        createdAt: now(),
        label: `Import of ${created.length} lead${created.length === 1 ? "" : "s"}`,
        kind: "research_lead",
        jobIds: db.jobs.filter((j) => j.batchId === batchId).map((j) => j.id),
      });
    }

    return {
      created: created.length,
      duplicates,
      batchId: created.length ? batchId : null,
      leads: db.leads,
    };
  });

  return Response.json(
    {
      ...result,
      warnings: [
        ...errors,
        ...(result.duplicates.length
          ? [
              `Already in the pipeline, skipped: ${result.duplicates.join(", ")}.`,
            ]
          : []),
      ],
    },
    { status: 201 },
  );
}

function dedupeKey(email: string, website: string, name: string): string {
  return (email || website || name).toLowerCase();
}
