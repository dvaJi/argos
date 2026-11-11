import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  available: true,
  keyVersion: 1,
  // When set, encryptStringAsync waits on it, so a test can interleave other operations.
  encryptGate: null as Promise<void> | null,
}));

vi.mock("electron", () => ({
  safeStorage: {
    isAsyncEncryptionAvailable: vi.fn(async () => state.available),
    encryptStringAsync: vi.fn(async (value: string) => {
      const version = state.keyVersion;
      if (state.encryptGate) await state.encryptGate;
      return Buffer.from(`v${version}:${value}`, "utf8");
    }),
    decryptStringAsync: vi.fn(async (value: Buffer) => {
      const [version, ...rest] = value.toString("utf8").split(":");
      return { result: rest.join(":"), shouldReEncrypt: version !== `v${state.keyVersion}` };
    }),
  },
}));

import { safeStorage } from "electron";
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
    state.encryptGate = null;
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

  it.each([
    ["deleted", (store: ElectronCredentialStore) => store.delete("token"), undefined],
    ["replaced", (store: ElectronCredentialStore) => store.set("token", "new-value"), "v2:new-value"],
  ] as const)(
    "does not undo a credential %s while a key-rotation re-encrypt is in flight",
    async (_label, concurrentChange, expected) => {
      const backing = createBackingStore();
      const store = new ElectronCredentialStore(backing);
      await store.set("token", "old-value");

      state.keyVersion = 2;
      let release!: () => void;
      state.encryptGate = new Promise<void>((resolve) => (release = resolve));
      vi.mocked(safeStorage.encryptStringAsync).mockClear();
      const pendingGet = store.get("token"); // decrypts, then waits in the re-encrypt
      await vi.waitFor(() => expect(safeStorage.encryptStringAsync).toHaveBeenCalledTimes(1));

      state.encryptGate = null;
      await concurrentChange(store);
      release();

      expect(await pendingGet).toBe("old-value");
      const stored = backing.values.get("token");
      expect(stored === undefined ? undefined : decode(stored)).toBe(expected);
    },
  );

  it("falls back to the raw value when encryption is unavailable", async () => {
    state.available = false;
    const backing = createBackingStore();
    const store = new ElectronCredentialStore(backing);

    await store.set("token", "plain-value");
    expect(backing.values.get("token")).toBe("plain-value");
    expect(await store.get("token")).toBe("plain-value");
  });
});
