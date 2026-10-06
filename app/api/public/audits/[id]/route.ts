import { after } from "next/server";
import { read } from "@/lib/db";
import { tick } from "@/lib/automation/engine";
import { toPublicAudit } from "@/lib/publicAudit";
import { corsHeaders } from "@/lib/publicAccess";

// Audit phases run inside after(), which shares this route's time limit: 300s,
// the Vercel Hobby maximum. Each phase's budget in lib/services/audit.ts sits under it.
export const maxDuration = 300;

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/**
 * The public view of one audit. Polled by the results page while the audit
 * runs, and each poll nudges the worker, so a public audit keeps moving even
 * with no console open. tick() refuses to overlap itself, so this is cheap.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/public/audits/[id]">,
) {
  const headers = { ...corsHeaders(request), "Cache-Control": "no-store" };
  const { id } = await ctx.params;
  const db = await read();
  const audit = db.audits.find((a) => a.id === id && a.source === "public");
  if (!audit) {
    return Response.json({ error: "Audit not found." }, { status: 404, headers });
  }

  if (audit.status === "queued" || audit.status === "running") {
    after(() => tick().catch(() => undefined));
  }

  return Response.json(
    { audit: toPublicAudit(audit, db.audits), paused: !db.settings.enabled },
    { headers },
  );
}
