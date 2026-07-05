import type { IConfigPresenter } from "@shared/presenter";
import type { LifecyclePort } from "@argos/acp-runtime";
import { AcpSessionManager, AcpSessionPersistence } from "@/presenter/llmProviderPresenter/acp";
import type { AcpProcessManager } from "@/presenter/llmProviderPresenter/acp";

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
