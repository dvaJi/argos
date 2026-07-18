export interface DatabaseStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  pluck(state?: boolean): this;
  bind(...params: unknown[]): this;
  iterate(...params: unknown[]): Iterable<unknown>;
  raw(state?: boolean): this;
  columns(): Array<{ name: string; type: string | null }>;
}

export interface DatabaseLike {
  prepare(sql: string): DatabaseStatement;
  exec(sql: string): void;
  pragma(sql: string, options?: { simple?: boolean }): unknown;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  close(): void;
  readonly open: boolean;
  readonly name: string;
}

class NullStatement implements DatabaseStatement {
  get(): unknown {
    return undefined;
  }
  all(): unknown[] {
    return [];
  }
  run(): { changes: number; lastInsertRowid: number | bigint } {
    return { changes: 0, lastInsertRowid: 0 };
  }
  pluck(): this {
    return this;
  }
  bind(): this {
    return this;
  }
  *iterate(): Iterable<unknown> {
    // empty
  }
  raw(): this {
    return this;
  }
  columns(): Array<{ name: string; type: string | null }> {
    return [];
  }
}

export class NullDatabase implements DatabaseLike {
  readonly open = true;
  readonly name = ":null:";

  prepare(_sql: string): DatabaseStatement {
    return new NullStatement();
  }
  exec(_sql: string): void {
    // no-op
  }
  pragma(_sql: string, _options?: { simple?: boolean }): unknown {
    return [];
  }
  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return fn;
  }
  close(): void {
    // no-op
  }
}
