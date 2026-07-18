import type { DatabaseLike as Database } from "./dbType";

export interface SchemaColumnSpec {
  name: string;
  declaredType: string | null;
  addColumnSql?: string;
  checkType?: boolean;
}

export interface SchemaIndexSpec {
  name: string;
  createSql: string;
}

export interface SchemaTableSpec {
  name: string;
  createSql: string;
  columns: SchemaColumnSpec[];
  indexes: SchemaIndexSpec[];
  afterRepair?: (db: Database) => void;
}
