export interface IPathResolver {
  getDataDir(): string;
  getConfigDir(): string;
  getCacheDir(): string;
  getTempDir(): string;
  getDatabasePath(): string;
  getLogsDir(): string;
}

export interface ICredentialStore {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface IConfigStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
  onChanged(callback: (key: string, value: unknown) => void): () => void;
}

export interface IDatabaseProvider {
  open(path: string, encryptionKey?: string): Promise<unknown>;
  close(): Promise<void>;
}

export interface ISubprocessRunner {
  spawn(command: string, args: string[], options?: Record<string, unknown>): unknown;
  exec(command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export interface IEventPublisher {
  publish(eventName: string, payload: unknown): void;
  subscribe(eventName: string, handler: (payload: unknown) => void): () => void;
}

export interface HostDependencies {
  paths: IPathResolver;
  credentials: ICredentialStore;
  config: IConfigStore;
  database: IDatabaseProvider;
  subprocess: ISubprocessRunner;
  events: IEventPublisher;
}
