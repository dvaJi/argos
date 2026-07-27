import { createHash, randomBytes } from "node:crypto";
import { logger } from "../logging";

type Db = {
  query<T = unknown>(
    sql: string,
  ): {
    get(...params: unknown[]): T | null | undefined;
    all(...params: unknown[]): T[];
    run(...params: unknown[]): { changes: number };
  };
  exec(sql: string): void;
};

export type SessionKind = "browser" | "bearer";

export type SessionRecord = {
  id: string;
  kind: SessionKind;
  label: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revoked: boolean;
};

export type VerifiedSession = {
  sessionId: string;
  kind: "browser-session" | "bearer-session";
};

export type PairingTokenInfo = {
  token: string;
  expiresAt: number;
};

export type PairingTokenConsumption = "accepted" | "invalid" | "expired" | "consumed";

const PAIRING_TOKEN_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_SLIDING_THRESHOLD_MS = 60 * 60 * 1000;

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

export class SessionAuthRepository {
  constructor(private db: Db) {}

  issuePairingToken(issuedBy = "cli"): PairingTokenInfo {
    const token = generateSecret();
    const tokenHash = hashSecret(token);
    const now = Date.now();
    const expiresAt = now + PAIRING_TOKEN_TTL_MS;

    this.db
      .query(
        "INSERT INTO auth_pairing_tokens (token_hash, created_at, expires_at, consumed_at, issued_by) VALUES (?, ?, ?, NULL, ?)",
      )
      .run(tokenHash, now, expiresAt, issuedBy);

    logger.info(`[auth] Issued pairing token (expires ${new Date(expiresAt).toISOString()})`);
    return { token, expiresAt };
  }

  consumePairingToken(token: string): boolean {
    return this.consumePairingTokenWithStatus(token) === "accepted";
  }

  consumePairingTokenWithStatus(token: string): PairingTokenConsumption {
    const tokenHash = hashSecret(token);
    const now = Date.now();

    const row = this.db
      .query<{ expires_at: number; consumed_at: number | null }>(
        "SELECT expires_at, consumed_at FROM auth_pairing_tokens WHERE token_hash = ?",
      )
      .get(tokenHash);

    if (!row) return "invalid";
    if (row.consumed_at !== null) return "consumed";
    if (now > row.expires_at) return "expired";

    const result = this.db
      .query("UPDATE auth_pairing_tokens SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL")
      .run(now, tokenHash);

    return result.changes > 0 ? "accepted" : "consumed";
  }

  createSession(kind: SessionKind, label = ""): { sessionId: string; secret: string; expiresAt: number } {
    const sessionId = `s-${randomBytes(8).toString("hex")}`;
    const secret = generateSecret();
    const secretHash = hashSecret(secret);
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;

    this.db
      .query(
        "INSERT INTO auth_sessions (id, kind, secret_hash, label, created_at, last_seen_at, expires_at, revoked) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
      )
      .run(sessionId, kind, secretHash, label, now, now, expiresAt);

    logger.info(`[auth] Created ${kind} session ${sessionId}`);
    return { sessionId, secret, expiresAt };
  }

  verifySession(secret: string): VerifiedSession | null {
    const secretHash = hashSecret(secret);
    const now = Date.now();

    const row = this.db
      .query<{ id: string; kind: string; expires_at: number; revoked: number; last_seen_at: number }>(
        "SELECT id, kind, expires_at, revoked, last_seen_at FROM auth_sessions WHERE secret_hash = ?",
      )
      .get(secretHash);

    if (!row) return null;
    if (row.revoked) return null;
    if (now > row.expires_at) return null;

    if (now - row.last_seen_at > SESSION_SLIDING_THRESHOLD_MS) {
      this.db.query("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").run(now, row.id);
    }

    return {
      sessionId: row.id,
      kind: row.kind === "browser" ? "browser-session" : "bearer-session",
    };
  }

  listSessions(): SessionRecord[] {
    const now = Date.now();
    const rows = this.db
      .query<{
        id: string;
        kind: string;
        label: string;
        created_at: number;
        last_seen_at: number;
        expires_at: number;
        revoked: number;
      }>(
        "SELECT id, kind, label, created_at, last_seen_at, expires_at, revoked FROM auth_sessions WHERE revoked = 0 AND expires_at > ? ORDER BY last_seen_at DESC",
      )
      .all(now);

    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as SessionKind,
      label: r.label,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      expiresAt: r.expires_at,
      revoked: r.revoked === 1,
    }));
  }

  revokeSession(sessionId: string): boolean {
    const result = this.db.query("UPDATE auth_sessions SET revoked = 1 WHERE id = ? AND revoked = 0").run(sessionId);
    if (result.changes > 0) {
      logger.info(`[auth] Revoked session ${sessionId}`);
    }
    return result.changes > 0;
  }

  isSessionActive(sessionId: string): boolean {
    const row = this.db
      .query<{ expires_at: number; revoked: number }>("SELECT expires_at, revoked FROM auth_sessions WHERE id = ?")
      .get(sessionId);
    return Boolean(row && row.revoked === 0 && row.expires_at > Date.now());
  }
}
