import { app, ipcMain, safeStorage } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getSidecarHandle } from "#/presenter/lifecyclePresenter/hooks/init/daemonSidecarHook";

const DAEMON_PORT_CHANNEL = "get-daemon-port";
const PAIRING_URL_CHANNEL = "generate-pairing-url";
const PAIR_REMOTE_MACHINE_CHANNEL = "pair-remote-machine";
const GET_REMOTE_MACHINE_CREDENTIAL_CHANNEL = "get-remote-machine-credential";
const DELETE_REMOTE_MACHINE_CREDENTIAL_CHANNEL = "delete-remote-machine-credential";

type StoredCredential = { encrypted: string; remoteUrl: string; sessionId?: string };
type StoredCredentials = Record<string, StoredCredential>;

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
  writeFileSync(credentialPath(), JSON.stringify(credentials), "utf8");
}

function encryptCredential(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Secure credential storage is unavailable");
  return safeStorage.encryptString(value).toString("base64");
}

function decryptCredential(value: string): string {
  return safeStorage.decryptString(Buffer.from(value, "base64"));
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
  ipcMain.handle(PAIR_REMOTE_MACHINE_CHANNEL, async (_event, pairingUrl: unknown) => {
    if (typeof pairingUrl !== "string" || !pairingUrl.trim()) {
      return { ok: false, error: { code: "pairing_invalid", message: "Enter a pairing link." } };
    }

    try {
      const parsed = new URL(pairingUrl.trim());
      const token = parsed.searchParams.get("token");
      if (!token || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
        return { ok: false, error: { code: "pairing_invalid", message: "That pairing link is invalid." } };
      }
      parsed.search = "";
      parsed.pathname = "/";
      const remoteUrl = parsed.toString().replace(/\/$/, "");
      const response = await fetch(`${remoteUrl}/api/v1/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, kind: "bearer" }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        sessionId?: string;
        sessionToken?: string;
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !body.ok || !body.sessionToken) {
        return {
          ok: false,
          error: { code: body.error?.code ?? "pairing_failed", message: body.error?.message ?? "Pairing failed." },
        };
      }
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
      });
      const verificationBody = (await verification.json()) as {
        ok?: boolean;
        output?: { environmentId?: string; serverVersion?: string; compatible?: boolean };
      };
      if (!verification.ok || !verificationBody.ok || !verificationBody.output?.compatible) {
        return {
          ok: false,
          error: {
            code: "authenticated_rpc_failed",
            message: "Pairing succeeded, but authenticated server verification failed.",
          },
        };
      }
      const credentialRef = `machine-${randomUUID()}`;
      const credentials = readCredentials();
      credentials[credentialRef] = {
        encrypted: encryptCredential(body.sessionToken),
        remoteUrl,
        sessionId: body.sessionId,
      };
      writeCredentials(credentials);
      return {
        ok: true,
        credentialRef,
        remoteUrl,
        sessionId: body.sessionId,
        environmentId: verificationBody.output.environmentId,
        serverVersion: verificationBody.output.serverVersion,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pairing failed.";
      return {
        ok: false,
        error: {
          code: message.includes("Secure credential storage") ? "secure_storage_unavailable" : "pairing_failed",
          message,
        },
      };
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
  ipcMain.handle(DELETE_REMOTE_MACHINE_CREDENTIAL_CHANNEL, async (_event, credentialRef: unknown) => {
    if (typeof credentialRef !== "string") return false;
    const credentials = readCredentials();
    const stored = credentials[credentialRef];
    if (!stored) return false;
    if (stored.sessionId) {
      try {
        const token = decryptCredential(stored.encrypted);
        await fetch(`${stored.remoteUrl}/api/v1/sessions/${encodeURIComponent(stored.sessionId)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Local removal remains safe even if the server is offline. The server
        // session will expire or can be revoked from its own settings.
      }
    }
    delete credentials[credentialRef];
    writeCredentials(credentials);
    return true;
  });
}
