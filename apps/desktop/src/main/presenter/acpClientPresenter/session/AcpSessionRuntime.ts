import type { IConfigPresenter } from "@shared/presenter";
import {
  AcpSessionManager,
  AcpSessionPersistence,
  type LifecyclePort,
  type AcpProcessManager,
} from "@argos/acp-runtime";

export class AcpSessionRuntime {
  readonly sessionManager: AcpSessionManager;

  constructor(input: {
    providerId: string;
    processManager: AcpProcessManager;
    sessionPersistence: AcpSessionPersistence;
    configPresenter: IConfigPresenter;
    lifecycle: LifecyclePort;
  }) {
    this.sessionManager = new AcpSessionManager(input);
  }
}
