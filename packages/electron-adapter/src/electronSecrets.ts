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
    if (!(await safeStorage.isAsyncEncryptionAvailable())) return encrypted;
    let decrypted: string;
    let shouldReEncrypt: boolean;
    try {
      const buffer = Buffer.from(encrypted, "base64");
      ({ result: decrypted, shouldReEncrypt } = await safeStorage.decryptStringAsync(buffer));
    } catch {
      return encrypted;
    }
    if (shouldReEncrypt) {
      // Key was rotated: re-encrypt with the current key. Best effort; the old ciphertext still decrypts.
      try {
        const rewrapped = (await safeStorage.encryptStringAsync(decrypted)).toString("base64");
        // Compare-and-set with no await in between, so a concurrent set()/delete() is not undone.
        if (this.store.get(key) === encrypted) this.store.set(key, rewrapped);
      } catch {
        // ignore
      }
    }
    return decrypted;
  }

  async set(key: string, value: string): Promise<void> {
    if (await safeStorage.isAsyncEncryptionAvailable()) {
      const encrypted = await safeStorage.encryptStringAsync(value);
      this.store.set(key, encrypted.toString("base64"));
    } else {
      this.store.set(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
