import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ available: true, keyVersion: 1 }));

vi.mock("electron", () => ({
  safeStorage: {
    isAsyncEncryptionAvailable: vi.fn(async () => state.available),
    encryptStringAsync: vi.fn(async (value: string) => Buffer.from(`v${state.keyVersion}:${value}`, "utf8")),
    decryptStringAsync: vi.fn(async (value: Buffer) => {
      const [version, ...rest] = value.toString("utf8").split(":");
      return { result: rest.join(":"), shouldReEncrypt: version !== `v${state.keyVersion}` };
    }),
  },
}));

import { ElectronCredentialStore } from "@argos/electron-adapter";

function createBackingStore() {
  const values = new Map<string, string>();
  return {
    values,
    get: (key: string) => values.get(key),
    set: (key: string, value: string) => void values.set(key, value),
    delete: (key: string) => void values.delete(key),
  };
}

const decode = (stored: string | undefined) => Buffer.from(stored ?? "", "base64").toString("utf8");

describe("ElectronCredentialStore", () => {
  beforeEach(() => {
    state.available = true;
    state.keyVersion = 1;
  });

  it("encrypts on set and decrypts on get", async () => {
    const backing = createBackingStore();
    const store = new ElectronCredentialStore(backing);

    await store.set("token", "secret-value");
    expect(backing.values.get("token")).not.toContain("secret-value");
    expect(decode(backing.values.get("token"))).toBe("v1:secret-value");
    expect(await store.get("token")).toBe("secret-value");

    await store.delete("token");
    expect(await store.get("token")).toBeUndefined();
  });

  it("re-encrypts a stored value when safeStorage reports a key rotation", async () => {
    const backing = createBackingStore();
    const store = new ElectronCredentialStore(backing);
    await store.set("token", "secret-value");

    state.keyVersion = 2;
    expect(await store.get("token")).toBe("secret-value");
    expect(decode(backing.values.get("token"))).toBe("v2:secret-value");
  });

  it("falls back to the raw value when encryption is unavailable", async () => {
    state.available = false;
    const backing = createBackingStore();
    const store = new ElectronCredentialStore(backing);

    await store.set("token", "plain-value");
    expect(backing.values.get("token")).toBe("plain-value");
    expect(await store.get("token")).toBe("plain-value");
  });
});
