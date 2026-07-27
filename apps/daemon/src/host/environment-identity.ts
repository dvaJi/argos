import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const IDENTITY_FILE = "environment-id";

/**
 * Stable identity for a daemon data directory. It intentionally does not use
 * hostname, address, or installation path because those can change.
 */
export function loadOrCreateEnvironmentId(dataDir: string): string {
  const path = join(dataDir, IDENTITY_FILE);
  const persist = (id: string) => {
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryPath, `${id}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      renameSync(temporaryPath, path);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  };
  try {
    if (existsSync(path)) {
      const value = readFileSync(path, "utf8").trim();
      if (value) return value;
    }
    const id = randomUUID();
    if (existsSync(path)) {
      persist(id);
    } else {
      writeFileSync(path, `${id}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    }
    return id;
  } catch {
    // A concurrent daemon may have created the file between the checks.
    try {
      const value = readFileSync(path, "utf8").trim();
      if (value) return value;
    } catch {
      // Fall through to an ephemeral identity; startup must remain available.
    }
    return randomUUID();
  }
}
