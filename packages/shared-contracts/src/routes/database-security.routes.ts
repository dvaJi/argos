import zod from "zod";
import { TimestampMsSchema, defineRouteContract } from "../common";

export const DatabaseSecurityPasswordStorageSchema = zod.enum(["safeStorage", "manual", "none"]);

export const DatabaseSecurityStatusSchema = zod.object({
  enabled: zod.boolean(),
  cipher: zod.literal("sqlcipher"),
  safeStorageAvailable: zod.boolean(),
  safeStorageBackend: zod.string().optional(),
  passwordStorage: DatabaseSecurityPasswordStorageSchema,
  manualUnlockRequired: zod.boolean(),
  migrationInProgress: zod.boolean(),
  lastMigrationAt: TimestampMsSchema.optional(),
});

export const databaseSecurityGetStatusRoute = defineRouteContract({
  name: "databaseSecurity.getStatus",
  input: zod.object({}).default({}),
  output: zod.object({
    status: DatabaseSecurityStatusSchema,
  }),
});

export const databaseSecurityEnableRoute = defineRouteContract({
  name: "databaseSecurity.enable",
  input: zod.object({
    password: zod.string().min(1),
  }),
  output: zod.object({
    status: DatabaseSecurityStatusSchema,
  }),
});

export const databaseSecurityChangePasswordRoute = defineRouteContract({
  name: "databaseSecurity.changePassword",
  input: zod.object({
    currentPassword: zod.string().min(1),
    newPassword: zod.string().min(1),
  }),
  output: zod.object({
    status: DatabaseSecurityStatusSchema,
  }),
});

export const databaseSecurityDisableRoute = defineRouteContract({
  name: "databaseSecurity.disable",
  input: zod.object({
    currentPassword: zod.string().min(1),
  }),
  output: zod.object({
    status: DatabaseSecurityStatusSchema,
  }),
});

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

export type DatabaseSecurityPasswordStorage = zod.infer<typeof DatabaseSecurityPasswordStorageSchema>;
export type DatabaseSecurityStatus = zod.infer<typeof DatabaseSecurityStatusSchema>;
export type DatabaseSchemaIssueKind = zod.infer<typeof DatabaseSchemaIssueKindSchema>;
export type DatabaseSchemaIssue = zod.infer<typeof DatabaseSchemaIssueSchema>;
export type DatabaseSchemaDiagnosis = zod.infer<typeof DatabaseSchemaDiagnosisSchema>;
export type DatabaseRepairStatus = zod.infer<typeof DatabaseRepairStatusSchema>;
export type DatabaseRepairReport = zod.infer<typeof DatabaseRepairReportSchema>;
