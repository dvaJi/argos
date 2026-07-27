import { app, ipcMain, safeStorage } from "electron";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getSidecarHandle } from "#/presenter/lifecyclePresenter/hooks/init/daemonSidecarHook";
import {
  classifyRemoteMachineTransportError,
  isRemoteMachinePairingErrorCode,
  parseRemoteMachinePairingLink,
  type RemoteMachinePairingErrorCode,
} from "@argos/shared/remoteMachinePairing";

const DAEMON_PORT_CHANNEL = "get-daemon-port";
const PAIRING_URL_CHANNEL = "generate-pairing-url";
const PAIR_REMOTE_MACHINE_CHANNEL = "pair-remote-machine";
const PAIR_REMOTE_MACHINE_PROGRESS_CHANNEL = "pair-remote-machine-progress";
const GET_REMOTE_MACHINE_CREDENTIAL_CHANNEL = "get-remote-machine-credential";
const DELETE_REMOTE_MACHINE_CREDENTIAL_CHANNEL = "delete-remote-machine-credential";
const REMOTE_FETCH_TIMEOUT_MS = 15_000;

type StoredCredential = { encrypted: string; remoteUrl: string; sessionId?: string };
type StoredCredentials = Record<string, StoredCredential>;
type PairingErrorCode = RemoteMachinePairingErrorCode | "pairing_failed";

function responsePairingErrorCode(value: unknown): PairingErrorCode {
  return isRemoteMachinePairingErrorCode(value) ? value : "pairing_failed";
}

function pairingError(code: PairingErrorCode, message: string) {
  return { ok: false as const, error: { code, message } };
}

function credentialPath(): string {
  return join(app.getPath("userData"), "remote-machine-sessions.json");
}

function readCredentials(): StoredCredentials {
  try {
    if (!existsSync(credentialPath())) return {};
    const parsed = JSON.parse(readFileSync(credentialPath(), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as StoredCredentials) : {};
  } catch {
    return {};
  }
}

function writeCredentials(credentials: StoredCredentials): void {
  const path = credentialPath();
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, JSON.stringify(credentials), { encoding: "utf8", flag: "wx", mode: 0o600 });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

function encryptCredential(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure credential storage is unavailable");
  return safeStorage.encryptString(value).toString("base64");
}

function decryptCredential(value: string): string {
  return safeStorage.decryptString(Buffer.from(value, "base64"));
}

async function revokeIssuedSession(remoteUrl: string, sessionId: string | undefined, token: string): Promise<void> {
  if (!sessionId) return;
  try {
    await fetch(`${remoteUrl}/api/v1/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
    });
  } catch {
    // Best effort: the short-lived bootstrap session will still expire server-side.
  }
}

export function registerDaemonPortHandler(): void {
  ipcMain.removeHandler(DAEMON_PORT_CHANNEL);
  ipcMain.handle(DAEMON_PORT_CHANNEL, () => {
    const handle = getSidecarHandle();
    if (handle && handle.port > 0) {
      return { port: handle.port, host: "127.0.0.1" };
    }
    return null;
  });

  ipcMain.removeHandler(PAIRING_URL_CHANNEL);
  ipcMain.handle(PAIRING_URL_CHANNEL, async () => {
    const handle = getSidecarHandle();
    if (!handle || handle.port <= 0) {
      return { ok: false, error: { code: "daemon_not_running", message: "Daemon is not running" } };
    }
    try {
      const res = await fetch(`http://127.0.0.1:${handle.port}/api/v1/pair/token`, { method: "POST" });
      return await res.json();
    } catch {
      return { ok: false, error: { code: "daemon_unreachable", message: "Failed to reach daemon" } };
    }
  });

  ipcMain.removeHandler(PAIR_REMOTE_MACHINE_CHANNEL);
  ipcMain.handle(PAIR_REMOTE_MACHINE_CHANNEL, async (event, pairingUrl: unknown, requestId: unknown) => {
    const reportProgress = (stage: string) => {
      if (typeof requestId === "string") {
        event.sender?.send?.(PAIR_REMOTE_MACHINE_PROGRESS_CHANNEL, { requestId, stage });
      }
    };
    reportProgress("parsing");
    if (typeof pairingUrl !== "string") return pairingError("pairing_invalid", "Enter a pairing link.");

    const parsed = parseRemoteMachinePairingLink(pairingUrl);
    if (!parsed.ok) return pairingError(parsed.error.code, parsed.error.message);

    let issuedSession: { remoteUrl: string; sessionId?: string; token: string } | null = null;
    try {
      const { remoteUrl, token } = parsed.value;
      reportProgress("reaching");
      const response = await fetch(`${remoteUrl}/api/v1/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, kind: "bearer" }),
        signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        return pairingError(
          responsePairingErrorCode(errorBody.error?.code),
          errorBody.error?.message ?? "Pairing failed.",
        );
      }
      reportProgress("exchanging");
      const body = (await response.json()) as {
        ok?: boolean;
        sessionId?: string;
        sessionToken?: string;
        error?: { code?: string; message?: string };
      };
      if (!body.ok || !body.sessionToken) {
        return pairingError(responsePairingErrorCode(body.error?.code), body.error?.message ?? "Pairing failed.");
      }
      issuedSession = { remoteUrl, sessionId: body.sessionId, token: body.sessionToken };
      reportProgress("authenticating");
      const verification = await fetch(`${remoteUrl}/api/v1/route`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${body.sessionToken}`,
        },
        body: JSON.stringify({
          route: "connection.describeEnvironment",
          input: { protocolVersion: 1, runtimeKind: "electron" },
        }),
        signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
      });
      if (!verification.ok) {
        await revokeIssuedSession(remoteUrl, body.sessionId, body.sessionToken);
        issuedSession = null;
        return pairingError(
          "authenticated_rpc_failed",
          "Pairing succeeded, but authenticated server verification failed.",
        );
      }
      const verificationBody = (await verification.json()) as {
        ok?: boolean;
        output?: {
          environmentId?: string;
          serverVersion?: string;
          protocolVersion?: number;
          runtimeKind?: "daemon";
          capabilities?: string[];
          compatible?: boolean;
        };
      };
      if (!verificationBody.ok || !verificationBody.output?.compatible) {
        await revokeIssuedSession(remoteUrl, body.sessionId, body.sessionToken);
        issuedSession = null;
        return pairingError(
          verificationBody.output && verificationBody.output.compatible === false
            ? "protocol_incompatible"
            : "authenticated_rpc_failed",
          verificationBody.output && verificationBody.output.compatible === false
            ? "This server is not compatible with this version of Argos."
            : "Pairing succeeded, but authenticated server verification failed.",
        );
      }
      reportProgress("storing");
      const credentialRef = `machine-${randomUUID()}`;
      const credentials = readCredentials();
      credentials[credentialRef] = {
        encrypted: encryptCredential(body.sessionToken),
        remoteUrl,
        sessionId: body.sessionId,
      };
      writeCredentials(credentials);
      issuedSession = null;
      return {
        ok: true,
        credentialRef,
        remoteUrl,
        sessionId: body.sessionId,
        environmentId: verificationBody.output.environmentId,
        serverVersion: verificationBody.output.serverVersion,
        protocolVersion: verificationBody.output.protocolVersion,
        runtimeKind: verificationBody.output.runtimeKind,
        capabilities: verificationBody.output.capabilities,
      };
    } catch (error) {
      if (issuedSession) {
        await revokeIssuedSession(issuedSession.remoteUrl, issuedSession.sessionId, issuedSession.token);
      }
      const message = error instanceof Error ? error.message : "Unable to reach the remote server.";
      return pairingError(
        message.includes("Secure credential storage")
          ? "secure_storage_unavailable"
          : classifyRemoteMachineTransportError(error),
        message,
      );
    }
  });

  ipcMain.removeHandler(GET_REMOTE_MACHINE_CREDENTIAL_CHANNEL);
  ipcMain.handle(GET_REMOTE_MACHINE_CREDENTIAL_CHANNEL, (_event, credentialRef: unknown) => {
    if (typeof credentialRef !== "string") return null;
    const stored = readCredentials()[credentialRef];
    if (!stored) return null;
    try {
      return { token: decryptCredential(stored.encrypted), remoteUrl: stored.remoteUrl, sessionId: stored.sessionId };
    } catch {
      return null;
    }
  });

  ipcMain.removeHandler(DELETE_REMOTE_MACHINE_CREDENTIAL_CHANNEL);
  ipcMain.handle(
    DELETE_REMOTE_MACHINE_CREDENTIAL_CHANNEL,
    async (_event, credentialRef: unknown, revokeRemoteSession: unknown = true) => {
      if (typeof credentialRef !== "string") return false;
      const credentials = readCredentials();
      const stored = credentials[credentialRef];
      if (!stored) return { localRemoved: false, remoteRevoked: null };
      let remoteRevoked: boolean | null = null;
      if (revokeRemoteSession !== false && stored.sessionId) {
        try {
          const token = decryptCredential(stored.encrypted);
          const response = await fetch(`${stored.remoteUrl}/api/v1/sessions/${encodeURIComponent(stored.sessionId)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
          });
          remoteRevoked = response.ok;
        } catch {
          remoteRevoked = false;
        }
      }
      delete credentials[credentialRef];
      writeCredentials(credentials);
      return { localRemoved: true, remoteRevoked };
    },
  );
}
