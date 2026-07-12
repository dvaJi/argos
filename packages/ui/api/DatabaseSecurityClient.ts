import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  databaseSecurityChangePasswordRoute,
  databaseSecurityDiagnoseSchemaRoute,
  databaseSecurityDisableRoute,
  databaseSecurityEnableRoute,
  databaseSecurityGetStatusRoute,
  databaseSecurityRepairSchemaRoute,
  type DatabaseRepairReport,
  type DatabaseSchemaDiagnosis,
  type DatabaseSecurityStatus,
} from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";

export function createDatabaseSecurityClient(bridge: ArgosBridge = getArgosBridge()) {
  async function getStatus(): Promise<DatabaseSecurityStatus> {
    const result = await bridge.invoke(databaseSecurityGetStatusRoute.name, {});
    return result.status;
  }

  async function enable(password: string): Promise<DatabaseSecurityStatus> {
    const result = await bridge.invoke(databaseSecurityEnableRoute.name, { password });
    return result.status;
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<DatabaseSecurityStatus> {
    const result = await bridge.invoke(databaseSecurityChangePasswordRoute.name, {
      currentPassword,
      newPassword,
    });
    return result.status;
  }

  async function disable(currentPassword: string): Promise<DatabaseSecurityStatus> {
    const result = await bridge.invoke(databaseSecurityDisableRoute.name, { currentPassword });
    return result.status;
  }

  async function diagnoseSchema(): Promise<DatabaseSchemaDiagnosis> {
    const result = await bridge.invoke(databaseSecurityDiagnoseSchemaRoute.name, {});
    return result.diagnosis;
  }

  async function repairSchema(): Promise<DatabaseRepairReport> {
    const result = await bridge.invoke(databaseSecurityRepairSchemaRoute.name, {});
    return result.report;
  }

  return {
    getStatus,
    enable,
    changePassword,
    disable,
    diagnoseSchema,
    repairSchema,
  };
}

export type DatabaseSecurityClient = ReturnType<typeof createDatabaseSecurityClient>;
