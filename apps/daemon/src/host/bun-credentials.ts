import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ICredentialStore } from "@argos/backend-core";

export class BunCredentialStore implements ICredentialStore {
  private filePath: string;
  private store: Record<string, string>;

  constructor(credentialPath: string) {
    this.filePath = credentialPath;
    this.store = this.load();
  }

  private load(): Record<string, string> {
    if (!existsSync(this.filePath)) {
      return {};
    }
    try {
      const raw = readFileSync(this.filePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), "utf-8");
  }

  async get(key: string): Promise<string | undefined> {
    return this.store[key];
  }

  async set(key: string, value: string): Promise<void> {
    this.store[key] = value;
    this.save();
  }

  async delete(key: string): Promise<void> {
    delete this.store[key];
    this.save();
  }
}
