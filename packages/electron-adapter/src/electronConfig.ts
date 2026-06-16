import type { IConfigStore } from "@argos/backend-core";

export class ElectronConfigStore implements IConfigStore {
  private store: Map<string, unknown>;

  constructor(initialEntries?: Record<string, unknown>) {
    this.store = new Map(Object.entries(initialEntries ?? {}));
  }

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  onChanged(_callback: (key: string, value: unknown) => void): () => void {
    return () => {};
  }
}
