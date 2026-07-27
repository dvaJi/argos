export type RemoteMachinePairingErrorCode =
  | "pairing_invalid"
  | "pairing_expired"
  | "pairing_consumed"
  | "endpoint_loopback_remote"
  | "endpoint_unreachable"
  | "tls_untrusted"
  | "session_revoked"
  | "secure_storage_unavailable"
  | "authenticated_rpc_failed"
  | "protocol_incompatible"
  | "environment_identity_changed"
  | "event_readiness_failed"
  | "capability_missing";

const REMOTE_MACHINE_PAIRING_ERROR_CODES = new Set<RemoteMachinePairingErrorCode>([
  "pairing_invalid",
  "pairing_expired",
  "pairing_consumed",
  "endpoint_loopback_remote",
  "endpoint_unreachable",
  "tls_untrusted",
  "session_revoked",
  "secure_storage_unavailable",
  "authenticated_rpc_failed",
  "protocol_incompatible",
  "environment_identity_changed",
  "event_readiness_failed",
  "capability_missing",
]);

export function isRemoteMachinePairingErrorCode(value: unknown): value is RemoteMachinePairingErrorCode {
  return typeof value === "string" && REMOTE_MACHINE_PAIRING_ERROR_CODES.has(value as RemoteMachinePairingErrorCode);
}

export type ParsedRemoteMachinePairing = {
  remoteUrl: string;
  token: string;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PAIRING_CODE_PREFIX = "ARGOS1";

export function formatRemoteMachinePairingCode(pairingUrl: string): string | null {
  try {
    const parsed = new URL(pairingUrl);
    const token = parsed.searchParams.get("token");
    if (!token || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) return null;
    return `${PAIRING_CODE_PREFIX} ${parsed.protocol === "https:" ? "S" : "P"} ${parsed.host} ${token}`;
  } catch {
    return null;
  }
}

function expandRemoteMachinePairingCode(value: string): string {
  const parts = value.split(/\s+/);
  if (parts.length !== 4 || parts[0].toUpperCase() !== PAIRING_CODE_PREFIX) return value;
  const protocol = parts[1].toUpperCase() === "S" ? "https:" : parts[1].toUpperCase() === "P" ? "http:" : null;
  if (!protocol) return value;
  return `${protocol}//${parts[2]}/pair?token=${encodeURIComponent(parts[3])}`;
}

export function parseRemoteMachinePairingLink(
  input: string,
):
  | { ok: true; value: ParsedRemoteMachinePairing }
  | { ok: false; error: { code: "pairing_invalid" | "endpoint_loopback_remote"; message: string } } {
  const value = expandRemoteMachinePairingCode(input.trim());
  if (!value) return { ok: false, error: { code: "pairing_invalid", message: "Enter a pairing link." } };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: { code: "pairing_invalid", message: "That pairing link is invalid." } };
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== "/" && parsed.pathname !== "/pair")
  ) {
    return { ok: false, error: { code: "pairing_invalid", message: "That pairing link is invalid." } };
  }

  if (LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase())) {
    return {
      ok: false,
      error: {
        code: "endpoint_loopback_remote",
        message: "This pairing link points to loopback. Use the server's reachable private-network or HTTPS address.",
      },
    };
  }

  const token = parsed.searchParams.get("token");
  if (!token) return { ok: false, error: { code: "pairing_invalid", message: "That pairing link is invalid." } };

  parsed.pathname = "/";
  parsed.search = "";
  parsed.hash = "";
  return { ok: true, value: { remoteUrl: parsed.toString().replace(/\/$/, ""), token } };
}

export function classifyRemoteMachineTransportError(error: unknown): RemoteMachinePairingErrorCode {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("certificate") || message.includes("tls") || message.includes("ssl")) return "tls_untrusted";
  return "endpoint_unreachable";
}
