const failedAttempts = new Map<string, { count: number; lastAttempt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MS = 300_000;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function isRateLimited(ip: string): boolean {
  const record = failedAttempts.get(ip);
  if (!record) return false;

  if (Date.now() - record.lastAttempt > LOCKOUT_MS) {
    failedAttempts.delete(ip);
    return false;
  }

  return record.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailure(ip: string): void {
  const existing = failedAttempts.get(ip);
  if (existing && Date.now() - existing.lastAttempt < RATE_LIMIT_WINDOW_MS) {
    existing.count++;
    existing.lastAttempt = Date.now();
  } else {
    failedAttempts.set(ip, { count: 1, lastAttempt: Date.now() });
  }
}

function clearFailures(ip: string): void {
  failedAttempts.delete(ip);
}

export function authenticate(request: Request, expectedToken: string): { ok: true } | { ok: false; error: string } {
  const ip = getClientIp(request);

  if (isRateLimited(ip)) {
    return { ok: false, error: "Too many failed attempts. Try again later." };
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return { ok: false, error: "Missing Authorization header" };
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    recordFailure(ip);
    return { ok: false, error: "Invalid Authorization format. Use: Bearer <token>" };
  }

  const token = match[1];
  if (token !== expectedToken) {
    recordFailure(ip);
    return { ok: false, error: "Invalid token" };
  }

  clearFailures(ip);
  return { ok: true };
}
