/**
 * The optional shared secret for endpoints that drive the queue. When
 * ADBIBE_CRON_SECRET is set, a scheduler — or this app calling itself — must
 * present it; when it is unset, those endpoints are open.
 */

export function isAuthorizedCaller(request: Request): boolean {
  const secret = process.env.ADBIBE_CRON_SECRET;
  if (!secret) return true;
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.headers.get("x-cron-secret");
  return provided === secret;
}

/** Headers that get this app's own requests past `isAuthorizedCaller`. */
export function callerAuthHeaders(): Record<string, string> {
  const secret = process.env.ADBIBE_CRON_SECRET;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}
