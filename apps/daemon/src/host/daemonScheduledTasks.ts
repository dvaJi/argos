import type { IEventPublisher, ProviderExecutionPort, SessionRepository } from "@argos/backend-core";
import { ScheduledTasksService, type ScheduledTasksUpsertInput } from "@argos/backend-core";
import type { CreateSessionInput } from "@argos/shared/types/agent-interface";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";

type ScheduledTaskSessionCreator = {
  createSessionForTask(input: {
    agentId: string;
    message: string;
    providerId?: string;
    modelId?: string;
    systemPrompt?: string;
  }): Promise<{ sessionId: string | null }>;
};

class DaemonScheduledTasksNotificationPresenter {
  constructor(private readonly eventPublisher: IEventPublisher) {}

  async showNotification(input: { id: string; title: string; body: string }): Promise<void> {
    this.eventPublisher.publish("scheduledTasks.notification", input);
  }
}

class DaemonScheduledTasksWindowPresenter {
  readonly mainWindow = null;

  sendToWindow(): never {
    throw new Error("Scheduled task prompt drafts require a desktop window");
  }

  focusMainWindow(): void {
    throw new Error("Scheduled task prompt drafts require a desktop window");
  }
}

/**
 * Daemon-owned scheduled task runtime. Reuses the shared scheduler but
 * replaces Electron window/notification dependencies with headless adapters
 * so server-side auto-send tasks can run without desktop support.
 */
export class DaemonScheduledTasks {
  readonly service: ScheduledTasksService;

  constructor(deps: {
    configPresenter: DaemonConfigPresenter;
    eventPublisher: IEventPublisher;
    sessionRepository: SessionRepository;
    providerExecutionPort: Pick<ProviderExecutionPort, "sendMessage">;
  }) {
    const sessionCreator: ScheduledTaskSessionCreator = {
      async createSessionForTask(input) {
        const sessionInput: CreateSessionInput = {
          agentId: input.agentId,
          message: input.message,
          ...(input.providerId ? { providerId: input.providerId } : {}),
          ...(input.modelId ? { modelId: input.modelId } : {}),
          ...(input.systemPrompt ? { generationSettings: { systemPrompt: input.systemPrompt } } : {}),
        };
        const session = await deps.sessionRepository.create(sessionInput, -1);
        if (!session?.id) {
          return { sessionId: null };
        }
        await deps.providerExecutionPort.sendMessage(session.id, input.message);
        return { sessionId: session.id };
      },
    };

    this.service = new ScheduledTasksService({
      configPresenter: deps.configPresenter,
      notificationPresenter: new DaemonScheduledTasksNotificationPresenter(deps.eventPublisher),
      windowPresenter: new DaemonScheduledTasksWindowPresenter(),
      sessionCreator,
    });
  }

  start(): void {
    this.service.start();
  }

  stop(): void {
    this.service.stop();
  }

  list() {
    return this.service.list();
  }

  upsert(input: ScheduledTasksUpsertInput) {
    return this.service.upsert(input);
  }

  delete(id: string) {
    return { settings: this.service.delete(id) };
  }

  toggle(id: string, enabled: boolean) {
    return this.service.toggle(id, enabled);
  }

  fireNow(id: string) {
    return this.service.fireNow(id);
  }
}
