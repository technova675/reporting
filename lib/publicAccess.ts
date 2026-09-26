/**
 * Guard rails for the unauthenticated audit endpoints: CORS for the
 * standalone embed, a per-IP rate limit, and a daily cap so a public form
 * cannot drain a free-tier model quota.
 */

const HOUR_MS = 3_600_000;

export function publicAuditsEnabled(): boolean {
  return process.env.PUBLIC_AUDITS_ENABLED !== "false";
}

export function perIpHourlyLimit(): number {
  return positiveInt(process.env.PUBLIC_AUDIT_LIMIT_PER_HOUR, 3);
}

export function dailyCap(): number {
  return positiveInt(process.env.PUBLIC_AUDIT_DAILY_CAP, 50);
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function corsHeaders(request: Request): Record<string, string> {
  const allowed = (process.env.PUBLIC_AUDIT_ALLOWED_ORIGINS ?? "*")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const origin = request.headers.get("origin");
  const allow = allowed.includes("*")
    ? "*"
    : origin && allowed.includes(origin)
      ? origin
      : null;
  if (!allow) return {};
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    ...(allow === "*" ? {} : { Vary: "Origin" }),
  };
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * In-memory, so it resets on restart and is per-instance. That is fine for
 * one server; behind several, move this to the store or a shared cache.
 */
const hits = new Map<string, number[]>();

export function takeRateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const at = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => at - t < HOUR_MS);
  if (recent.length >= perIpHourlyLimit()) {
    hits.set(ip, recent);
    return { ok: false, retryAfterSec: Math.ceil((recent[0] + HOUR_MS - at) / 1000) };
  }
  recent.push(at);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => at - t >= HOUR_MS)) hits.delete(key);
    }
  }
  return { ok: true };
}
