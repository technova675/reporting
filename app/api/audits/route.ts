import { now, read, write } from "@/lib/db";
import { createAudit, parseAuditInputs } from "@/lib/auditRequests";

export async function GET() {
  const db = await read();
  // The list view never needs the full category payload.
  return Response.json({
    audits: db.audits.map(({ categories, ...rest }) => ({
      ...rest,
      findingCount: categories.reduce((n, c) => n + c.findings.length, 0),
    })),
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = parseAuditInputs(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const { inputs } = parsed;
  const leadId = typeof body.leadId === "string" ? body.leadId : null;

  const audit = await write((db) => {
    const record = createAudit(db, inputs, leadId ? "outbound" : "console", leadId);

    if (leadId) {
      const lead = db.leads.find((l) => l.id === leadId);
      if (lead) {
        lead.auditId = record.id;
        lead.updatedAt = now();
        lead.events.push({
          at: now(),
          type: "note",
          detail: "Marketing audit queued for this lead.",
        });
      }
    }
    return record;
  });

  return Response.json({ audit }, { status: 201 });
}
