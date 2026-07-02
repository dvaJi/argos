import type { AuthContext, AuthGateConfig } from "@argos/shared-contracts/auth";

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

export function isLocalRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
}

export type AuthResult =
  | { ok: true; context: AuthContext }
  | { ok: false; status: number; code: string; message: string };

function unauthorized(ip: string, message: string): AuthResult {
  recordFailure(ip);
  return { ok: false, status: 401, code: "unauthorized", message };
}

/**
 * Resolve an AuthContext from an incoming request.
 *
 * Phase 1 (this implementation) accepts:
 * - Loopback requests: implicit desktop-bootstrap trust (desktop-managed sidecar).
 * - Non-loopback with a matching desktop-bootstrap bearer header.
 *
 * Phase 2 (pairing-and-session-auth) will add browser-session / bearer-session
 * verification here. Until then, non-loopback requests without a desktop-bootstrap
 * secret are rejected — remote/mobile access is intentionally unavailable.
 */
export function authorize(request: Request, config: AuthGateConfig): AuthResult {
  const ip = getClientIp(request);

  if (isRateLimited(ip)) {
    return { ok: false, status: 429, code: "rate_limited", message: "Too many failed attempts. Try again later." };
  }

  const loopback = isLocalRequest(request);

  if (loopback) {
    clearFailures(ip);
    return {
      ok: true,
      context: {
        credentialKind: "desktop-bootstrap",
        exposureMode: config.exposureMode,
        isLoopback: true,
      },
    };
  }

  const bootstrapSecret = config.desktopBootstrapSecret;
  if (bootstrapSecret) {
    const authHeader = request.headers.get("authorization");
    const match = authHeader?.match(/^Bearer\s+(.+)$/i);
    if (match && match[1] === bootstrapSecret) {
      clearFailures(ip);
      return {
        ok: true,
        context: {
          credentialKind: "desktop-bootstrap",
          exposureMode: config.exposureMode,
          isLoopback: false,
        },
      };
    }
  }

  return unauthorized(ip, "Authentication required. No valid credential provided.");
}
