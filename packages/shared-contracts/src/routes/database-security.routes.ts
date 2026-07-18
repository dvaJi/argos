import zod from "zod";
import { defineRouteContract } from "../common";

export const DatabaseSchemaIssueKindSchema = zod.enum([
  "missing_table",
  "missing_column",
  "missing_index",
  "column_type_mismatch",
]);

export const DatabaseSchemaIssueSchema = zod.object({
  kind: DatabaseSchemaIssueKindSchema,
  table: zod.string(),
  name: zod.string(),
  repairable: zod.boolean(),
  message: zod.string(),
  expectedType: zod.string().nullable().optional(),
  actualType: zod.string().nullable().optional(),
});

export const DatabaseSchemaDiagnosisSchema = zod.object({
  checkedAt: zod.number(),
  isHealthy: zod.boolean(),
  issues: zod.array(DatabaseSchemaIssueSchema),
  repairableIssues: zod.array(DatabaseSchemaIssueSchema),
  manualIssues: zod.array(DatabaseSchemaIssueSchema),
});

export const DatabaseRepairStatusSchema = zod.enum(["healthy", "repaired", "manual-action-required"]);

export const DatabaseRepairReportSchema = zod.object({
  startedAt: zod.number(),
  finishedAt: zod.number(),
  status: DatabaseRepairStatusSchema,
  backupPath: zod.string().nullable(),
  diagnosisBeforeRepair: DatabaseSchemaDiagnosisSchema,
  diagnosisAfterRepair: DatabaseSchemaDiagnosisSchema,
  repairedIssues: zod.array(DatabaseSchemaIssueSchema),
  remainingIssues: zod.array(DatabaseSchemaIssueSchema),
});

export const databaseSecurityDiagnoseSchemaRoute = defineRouteContract({
  name: "databaseSecurity.diagnoseSchema",
  input: zod.object({}).default({}),
  output: zod.object({
    diagnosis: DatabaseSchemaDiagnosisSchema,
  }),
});

export const databaseSecurityRepairSchemaRoute = defineRouteContract({
  name: "databaseSecurity.repairSchema",
  input: zod.object({}).default({}),
  output: zod.object({
    report: DatabaseRepairReportSchema,
  }),
});

export type DatabaseSchemaIssueKind = zod.infer<typeof DatabaseSchemaIssueKindSchema>;
export type DatabaseSchemaIssue = zod.infer<typeof DatabaseSchemaIssueSchema>;
export type DatabaseSchemaDiagnosis = zod.infer<typeof DatabaseSchemaDiagnosisSchema>;
export type DatabaseRepairStatus = zod.infer<typeof DatabaseRepairStatusSchema>;
export type DatabaseRepairReport = zod.infer<typeof DatabaseRepairReportSchema>;
