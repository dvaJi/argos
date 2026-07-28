import type { AuthContext, AuthGateConfig } from "@argos/shared-contracts/auth";

const failedAttempts = new Map<string, { count: number; lastAttempt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MS = 300_000;

const SESSION_COOKIE_NAME = "argos_session";

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

function getCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1];

  // Browser WebSocket clients cannot set Authorization headers. The SDK uses
  // a dedicated negotiated subprotocol for bearer-session authentication.
  const protocols =
    request.headers
      .get("sec-websocket-protocol")
      ?.split(",")
      .map((value) => value.trim()) ?? [];
  const bearerProtocol = protocols.find((value) => value.startsWith("argos-bearer."));
  return bearerProtocol?.slice("argos-bearer.".length) || null;
}

/**
 * Resolve an AuthContext from an incoming request.
 *
 * Accepts:
 * - Loopback requests: implicit desktop-bootstrap trust (desktop-managed sidecar).
 * - Non-loopback with a matching desktop-bootstrap bearer header.
 * - Session credentials: browser-session (cookie) or bearer-session (header),
 *   verified via config.verifySession when available.
 *
 * Everything else is rejected on non-loopback.
 */
export async function authorize(request: Request, config: AuthGateConfig): Promise<AuthResult> {
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
  const bearerToken = getBearerToken(request);

  if (bootstrapSecret && bearerToken === bootstrapSecret) {
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

  if (config.verifySession) {
    const cookieSecret = getCookie(request, SESSION_COOKIE_NAME);
    if (cookieSecret) {
      const session = await config.verifySession(cookieSecret);
      if (session) {
        clearFailures(ip);
        return {
          ok: true,
          context: {
            credentialKind: "browser-session",
            sessionId: session.sessionId,
            exposureMode: config.exposureMode,
            isLoopback: false,
          },
        };
      }
    }

    if (bearerToken) {
      const session = await config.verifySession(bearerToken);
      if (session) {
        clearFailures(ip);
        return {
          ok: true,
          context: {
            credentialKind: "bearer-session",
            sessionId: session.sessionId,
            exposureMode: config.exposureMode,
            isLoopback: false,
          },
        };
      }
    }
  }

  return unauthorized(ip, "Authentication required. No valid credential provided.");
}
