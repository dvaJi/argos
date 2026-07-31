import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  databaseSecurityDiagnoseSchemaRoute,
  databaseSecurityRepairSchemaRoute,
  type DatabaseRepairReport,
  type DatabaseSchemaDiagnosis,
} from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";

export function createDatabaseSecurityClient(bridge: ArgosBridge = getArgosBridge()) {
  async function diagnoseSchema(): Promise<DatabaseSchemaDiagnosis> {
    const result = await bridge.invoke(databaseSecurityDiagnoseSchemaRoute.name, {});
    return result.diagnosis;
  }

  async function repairSchema(): Promise<DatabaseRepairReport> {
    const result = await bridge.invoke(databaseSecurityRepairSchemaRoute.name, {});
    return result.report;
  }

  return {
    diagnoseSchema,
    repairSchema,
  };
}

type DatabaseSecurityClient = ReturnType<typeof createDatabaseSecurityClient>;
