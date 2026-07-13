/**
 * Deterministic fingerprints for ACP messages and content blocks.
 *
 * Used by the import/sync flow so that replaying the same remote session
 * updates does not create duplicate persisted Argos messages. A fingerprint
 * is stable for a given (role, text, ordering of structured blocks) tuple and
 * does not depend on volatile fields such as timestamps or session ids.
 */

export interface FingerprintMessageInput {
  role: string;
  content?: unknown;
  blocks?: Array<{ type: string; [key: string]: unknown }>;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function normalizeContent(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

export function fingerprintMessage(input: FingerprintMessageInput): string {
  const role = input.role;
  const text = normalizeContent(input.content);
  const blocks = (input.blocks ?? [])
    .map((block) => {
      const entries = Object.keys(block)
        .sort()
        .map((key) => `${key}=${JSON.stringify(block[key])}`);
      return `${block.type}:{${entries.join(",")}}`;
    })
    .join("|");
  return hashString(`${role}::${text}::${blocks}`);
}

export function fingerprintMessages(messages: Array<FingerprintMessageInput>): string[] {
  return messages.map(fingerprintMessage);
}
