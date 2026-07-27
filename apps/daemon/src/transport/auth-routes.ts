import type { SessionAuthRepository } from "../host/session-auth-repository";

const SESSION_COOKIE_NAME = "argos_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * POST /api/v1/pair — bootstrap class endpoint.
 * Accepts a one-time pairing token and creates a session.
 * Body: { token: string, kind?: "browser" | "bearer" }
 */
export async function handlePair(request: Request, repo: SessionAuthRepository): Promise<Response> {
  let body: { token?: string; kind?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ok: false, error: { code: "invalid_json", message: "Request body must be valid JSON" } },
      { status: 400 },
    );
  }

  if (!body.token || typeof body.token !== "string") {
    return Response.json({ ok: false, error: { code: "invalid_request", message: "Missing token" } }, { status: 400 });
  }

  const pairingToken = repo.consumePairingTokenWithStatus(body.token);
  if (pairingToken !== "accepted") {
    const error =
      pairingToken === "expired"
        ? { code: "pairing_expired", message: "This pairing link has expired. Generate a new one on the server." }
        : pairingToken === "consumed"
          ? {
              code: "pairing_consumed",
              message: "This pairing link has already been used. Generate a new one on the server.",
            }
          : { code: "pairing_invalid", message: "This pairing link is invalid." };
    return Response.json({ ok: false, error }, { status: 401 });
  }

  const kind = body.kind === "browser" ? "browser" : "bearer";
  const label = request.headers.get("user-agent")?.slice(0, 100) || "";
  const session = repo.createSession(kind, label);

  if (kind === "browser") {
    return Response.json(
      { ok: true, sessionId: session.sessionId },
      {
        headers: {
          "Set-Cookie": `${SESSION_COOKIE_NAME}=${session.secret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}`,
        },
      },
    );
  }

  return Response.json({ ok: true, sessionId: session.sessionId, sessionToken: session.secret });
}

/**
 * GET /api/v1/sessions — authenticated class endpoint.
 * Lists active (non-revoked, non-expired) sessions.
 */
export function handleListSessions(repo: SessionAuthRepository): Response {
  const sessions = repo.listSessions();
  return Response.json({ ok: true, sessions });
}

/**
 * DELETE /api/v1/sessions/:id — authenticated class endpoint.
 * Revokes a session by id.
 */
export function handleRevokeSession(repo: SessionAuthRepository, sessionId: string): Response {
  const revoked = repo.revokeSession(sessionId);
  if (!revoked) {
    return Response.json(
      { ok: false, error: { code: "not_found", message: "Session not found or already revoked" } },
      { status: 404 },
    );
  }
  return Response.json({ ok: true });
}

/**
 * POST /api/v1/pair/token — gated by authorize() (loopback trusted;
 * non-loopback requires bootstrap/session).
 * Issues a one-time pairing token and returns a pairing URL.
 * Used by the desktop settings UI to generate browser access links.
 */
export function handleIssuePairingToken(repo: SessionAuthRepository, origin: string): Response {
  const pairing = repo.issuePairingToken("desktop");
  const pairingUrl = `${origin}/pair?token=${pairing.token}`;
  return Response.json({ ok: true, pairingUrl, expiresAt: pairing.expiresAt });
}
