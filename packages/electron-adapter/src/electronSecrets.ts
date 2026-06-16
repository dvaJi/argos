import { safeStorage } from "electron";
import type { ICredentialStore } from "@argos/backend-core";

export class ElectronCredentialStore implements ICredentialStore {
  constructor(
    private readonly store: {
      get(key: string): string | undefined;
      set(key: string, value: string): void;
      delete(key: string): void;
    },
  ) {}

  async get(key: string): Promise<string | undefined> {
    const encrypted = this.store.get(key);
    if (!encrypted) return undefined;
    if (!safeStorage.isEncryptionAvailable()) return encrypted;
    try {
      const buffer = Buffer.from(encrypted, "base64");
      return safeStorage.decryptString(buffer);
    } catch {
      return encrypted;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(value);
      this.store.set(key, encrypted.toString("base64"));
    } else {
      this.store.set(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
