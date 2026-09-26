import { after } from "next/server";
import { read, write } from "@/lib/db";
import { tick } from "@/lib/automation/engine";
import { createAudit, parseAuditInputs } from "@/lib/auditRequests";
import {
  clientIp,
  corsHeaders,
  dailyCap,
  publicAuditsEnabled,
  takeRateLimit,
} from "@/lib/publicAccess";

/**
 * The public intake for the free audit — what /audit and the standalone
 * embed post to. Returns only the new audit's id; the report is fetched from
 * /api/public/audits/[id].
 */

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request);
  const fail = (error: string, status: number, extra: Record<string, string> = {}) =>
    Response.json({ error }, { status, headers: { ...headers, ...extra } });

  if (!publicAuditsEnabled()) {
    return fail("Free audits are paused right now. Please check back soon.", 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("Request body must be JSON.", 400);
  }

  const parsed = parseAuditInputs(body);
  if ("error" in parsed) return fail(parsed.error, 400);

  // Honeypot filled in: look successful, do nothing.
  if (typeof body.hp === "string" && body.hp.trim()) {
    return Response.json({ id: null }, { status: 202, headers });
  }

  const limit = takeRateLimit(clientIp(request));
  if (!limit.ok) {
    return fail(
      "You've run a few audits in the last hour. Please try again a little later.",
      429,
      { "Retry-After": String(limit.retryAfterSec) },
    );
  }

  const db = await read();
  const dayAgo = Date.now() - 86_400_000;
  const today = db.audits.filter(
    (a) => a.source === "public" && Date.parse(a.createdAt) > dayAgo,
  ).length;
  if (today >= dailyCap()) {
    return fail(
      "We've hit today's limit for free audits. Please try again tomorrow.",
      503,
    );
  }

  const audit = await write((store) => createAudit(store, parsed.inputs, "public"));

  // Start the worker now instead of waiting for the console or a cron tick.
  after(() => tick().catch(() => undefined));

  return Response.json({ id: audit.id }, { status: 201, headers });
}
