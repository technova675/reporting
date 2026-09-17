import { newId, now, read, write } from "@/lib/db";
import { enqueue } from "@/lib/automation/engine";
import type { Audit, AuditInputs } from "@/lib/types";

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

interface CreateBody extends AuditInputs {
  leadId?: string;
}

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const website = (body.website ?? "").trim();
  if (!website) {
    return Response.json(
      { error: "A website is required to run an audit." },
      { status: 400 },
    );
  }

  const inputs: AuditInputs = {
    website: website.replace(/^https?:\/\//i, "").replace(/\/$/, ""),
    brand: body.brand?.trim() || undefined,
    industry: body.industry?.trim() || undefined,
    social: body.social?.trim() || undefined,
    competitors: body.competitors?.trim() || undefined,
    context: body.context?.trim() || undefined,
  };

  const audit = await write((db) => {
    const record: Audit = {
      id: newId("audit"),
      createdAt: now(),
      updatedAt: now(),
      status: "queued",
      inputs,
      brandName: inputs.brand ?? null,
      overallScore: null,
      categories: [],
      topPriorities: [],
      executiveSummary: null,
      error: null,
      leadId: body.leadId ?? null,
      tokensIn: 0,
      tokensOut: 0,
      durationMs: 0,
    };
    db.audits.unshift(record);
    enqueue(db, "run_audit", record.id, inputs.brand || inputs.website);

    if (body.leadId) {
      const lead = db.leads.find((l) => l.id === body.leadId);
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
