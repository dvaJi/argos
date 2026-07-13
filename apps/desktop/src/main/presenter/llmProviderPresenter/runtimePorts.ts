import type { IMCPPresenter } from "@argos/shared/presenter";

export interface ProviderMcpRuntimePort {
  getNpmRegistry?: IMCPPresenter["getNpmRegistry"];
  getUvRegistry?: IMCPPresenter["getUvRegistry"];
}
