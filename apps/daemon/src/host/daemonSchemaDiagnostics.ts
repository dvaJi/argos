import type {
  DatabaseRepairReport,
  DatabaseSchemaDiagnosis,
  DatabaseSchemaIssue,
} from "@argos/shared-contracts/routes";
import {
  CORE_TABLES,
  INDEXES,
  runMigrations,
  getSchemaVersion,
  setSchemaVersion,
  CURRENT_SCHEMA_VERSION,
} from "./db-init";

type BunDatabase = {
  exec(sql: string): void;
  query<T = unknown>(
    sql: string,
  ): {
    get(...params: unknown[]): T | null | undefined;
    all(...params: unknown[]): T[];
    run(...params: unknown[]): { changes: number };
  };
  close(): void;
};

interface ExpectedColumn {
  name: string;
  type: string;
}

interface ExpectedTable {
  name: string;
  columns: ExpectedColumn[];
}

function parseCreateTableColumns(sql: string): ExpectedColumn[] {
  const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+|"[^"]+"|`[^`]+`)\s*\(([\s\S]*)\)/i);
  if (!match) return [];
  const body = match[2];
  const columns: ExpectedColumn[] = [];
  const lines = splitTopLevel(body);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const upper = trimmed.toUpperCase();
    if (
      upper.startsWith("FOREIGN KEY") ||
      upper.startsWith("PRIMARY KEY") ||
      upper.startsWith("UNIQUE") ||
      upper.startsWith("CHECK") ||
      upper.startsWith("CONSTRAINT")
    ) {
      continue;
    }
    const colMatch = trimmed.match(/^(\w+|"[^"]+"|`[^`]+`)\s+(.*)$/);
    if (!colMatch) continue;
    const colName = colMatch[1].replace(/["`]/g, "");
    const rest = colMatch[2].trim();
    const typeMatch = rest.match(/^(\w+(?:\s*\([^)]*\))?)/);
    columns.push({ name: colName, type: (typeMatch ? typeMatch[1] : rest).trim().toUpperCase() });
  }
  return columns;
}

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function getExpectedTables(): ExpectedTable[] {
  const tables: ExpectedTable[] = [];
  for (const sql of CORE_TABLES) {
    const match = sql.match(/CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+|"[^"]+"|`[^`]+`)/i);
    if (!match) continue;
    const name = match[1].replace(/["`]/g, "");
    if (/CREATE\s+VIRTUAL\s+TABLE/i.test(sql)) continue;
    tables.push({ name, columns: parseCreateTableColumns(sql) });
  }
  return tables;
}

function readExistingTableColumns(db: BunDatabase, tableName: string): Map<string, string> {
  try {
    const rows = db.query<{ name: string; type: string }>(`PRAGMA table_info(${tableName})`).all();
    return new Map(rows.map((r) => [r.name, (r.type || "").trim().toUpperCase()]));
  } catch {
    return new Map();
  }
}

function tableExists(db: BunDatabase, tableName: string): boolean {
  const row = db
    .query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return !!row;
}

export function diagnoseDaemonSchema(db: BunDatabase): DatabaseSchemaDiagnosis {
  const checkedAt = Date.now();
  const issues: DatabaseSchemaIssue[] = [];
  const expectedTables = getExpectedTables();

  for (const expected of expectedTables) {
    if (!tableExists(db, expected.name)) {
      issues.push({
        kind: "missing_table",
        table: expected.name,
        name: expected.name,
        repairable: true,
        message: `Table ${expected.name} is missing`,
      });
      continue;
    }

    const actual = readExistingTableColumns(db, expected.name);
    for (const col of expected.columns) {
      if (!actual.has(col.name)) {
        issues.push({
          kind: "missing_column",
          table: expected.name,
          name: col.name,
          repairable: true,
          message: `Column ${col.name} is missing in table ${expected.name}`,
        });
      }
    }
  }

  const repairableIssues = issues.filter((i) => i.repairable);
  const manualIssues = issues.filter((i) => !i.repairable);

  return {
    checkedAt,
    isHealthy: issues.length === 0,
    issues,
    repairableIssues,
    manualIssues,
  };
}

export function repairDaemonSchema(db: BunDatabase): DatabaseRepairReport {
  const startedAt = Date.now();
  const beforeDiagnosis = diagnoseDaemonSchema(db);

  for (const sql of CORE_TABLES) {
    try {
      db.exec(sql);
    } catch {
      // table may already exist with a different shape
    }
  }
  for (const sql of INDEXES) {
    try {
      db.exec(sql);
    } catch {
      // index may reference a column added by migration
    }
  }

  const version = getSchemaVersion(db);
  if (version < CURRENT_SCHEMA_VERSION) {
    runMigrations(db, version);
    setSchemaVersion(db, CURRENT_SCHEMA_VERSION);
  }

  const afterDiagnosis = diagnoseDaemonSchema(db);
  const repairedIssueKeys = new Set(
    beforeDiagnosis.issues
      .filter((i) => !afterDiagnosis.issues.some((a) => a.table === i.table && a.name === i.name && a.kind === i.kind))
      .map((i) => `${i.kind}:${i.table}:${i.name}`),
  );
  const repairedIssues = beforeDiagnosis.issues.filter((i) => repairedIssueKeys.has(`${i.kind}:${i.table}:${i.name}`));

  const status: DatabaseRepairReport["status"] = afterDiagnosis.isHealthy
    ? beforeDiagnosis.isHealthy
      ? "healthy"
      : "repaired"
    : "manual-action-required";

  return {
    startedAt,
    finishedAt: Date.now(),
    status,
    backupPath: null,
    diagnosisBeforeRepair: beforeDiagnosis,
    diagnosisAfterRepair: afterDiagnosis,
    repairedIssues,
    remainingIssues: afterDiagnosis.issues,
  };
}
