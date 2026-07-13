import {
  IKnowledgeTaskPresenter,
  KnowledgeChunkTask,
  TaskQueueStatus,
  TaskStatusSummary,
} from "@argos/shared/presenter";

export class KnowledgeTaskPresenter implements IKnowledgeTaskPresenter {
  private queue: KnowledgeChunkTask[] = [];
  private controllers: Map<string, AbortController> = new Map();
  private runningTasks: Map<string, KnowledgeChunkTask> = new Map();
  private maxConcurrency: number;

  constructor(maxConcurrency = 16) {
    this.maxConcurrency = maxConcurrency;
  }

  addTask(task: KnowledgeChunkTask): void {
    console.log(`[RAG TASK] Adding task: ${task.id}`);
    this.queue.push(task);
    this.controllers.set(task.id, new AbortController());
    this.processQueue();
  }

  removeTasks(filter: (task: KnowledgeChunkTask) => boolean): void {
    this.queue = this.queue.filter((task) => {
      if (filter(task)) {
        console.log(`[RAG TASK] Removing queued task: ${task.id}`);
        this.terminateTask(task.id);
        return false;
      }
      return true;
    });

    for (const [taskId, task] of this.runningTasks) {
      if (filter(task)) {
        console.log(`[RAG TASK] Terminating running task: ${taskId}`);
        this.terminateTask(taskId);
      }
    }
  }

  cancelTasksByKnowledgeBase(knowledgeBaseId: string): void {
    this.removeTasks((task) => task.payload.knowledgeBaseId === knowledgeBaseId);
  }

  cancelTasksByFile(fileId: string): void {
    this.removeTasks((task) => task.payload.fileId === fileId);
  }

  getTaskStatus(): TaskStatusSummary {
    const status: TaskStatusSummary = {
      pending: this.queue.length,
      processing: this.runningTasks.size,
      byKnowledgeBase: new Map<string, { pending: number; processing: number }>(),
    };

    for (const task of this.queue) {
      const kbId = task.payload.knowledgeBaseId;
      if (!status.byKnowledgeBase.has(kbId)) {
        status.byKnowledgeBase.set(kbId, { pending: 0, processing: 0 });
      }
      status.byKnowledgeBase.get(kbId)!.pending++;
    }

    for (const task of this.runningTasks.values()) {
      const kbId = task.payload.knowledgeBaseId;
      if (!status.byKnowledgeBase.has(kbId)) {
        status.byKnowledgeBase.set(kbId, { pending: 0, processing: 0 });
      }
      status.byKnowledgeBase.get(kbId)!.processing++;
    }

    return status;
  }

  hasActiveTasks(): boolean {
    return this.queue.length > 0 || this.runningTasks.size > 0;
  }

  hasActiveTasksForKnowledgeBase(knowledgeBaseId: string): boolean {
    return (
      this.queue.some((t) => t.payload.knowledgeBaseId === knowledgeBaseId) ||
      Array.from(this.runningTasks.values()).some((t) => t.payload.knowledgeBaseId === knowledgeBaseId)
    );
  }

  hasActiveTasksForFile(fileId: string): boolean {
    return (
      this.queue.some((t) => t.payload.fileId === fileId) ||
      Array.from(this.runningTasks.values()).some((t) => t.payload.fileId === fileId)
    );
  }

  getStatus(): TaskQueueStatus {
    return {
      totalTasks: this.queue.length + this.runningTasks.size,
      runningTasks: this.runningTasks.size,
      queuedTasks: this.queue.length,
    };
  }

  destroy(): void {
    console.log("[RAG TASK] Destroying TaskManager, all tasks will be terminated.");
    this.removeTasks(() => true);
    this.queue = [];
    this.controllers.forEach((c) => c.abort());
    this.controllers.clear();
    this.runningTasks.clear();
  }

  private terminateTask(taskId: string): void {
    const controller = this.controllers.get(taskId);
    if (controller) {
      controller.abort();
      this.controllers.delete(taskId);
    }
    this.runningTasks.delete(taskId);
  }

  private async processQueue(): Promise<void> {
    while (this.queue.length > 0 && this.runningTasks.size < this.maxConcurrency) {
      const task = this.queue.shift()!;
      const controller = this.controllers.get(task.id)!;
      this.runningTasks.set(task.id, task);
      (async () => {
        try {
          await task.run({ signal: controller.signal });
          if (controller.signal.aborted) {
            task.onTerminate?.();
          } else {
            task.onSuccess?.();
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            console.log(`[RAG TASK] Task ${task.id} aborted during execution.`);
            task.onTerminate?.();
          } else {
            console.error(`[RAG TASK] Task ${task.id} failed with error:`, error);
            task.onError?.(error as Error);
          }
        } finally {
          this.controllers.delete(task.id);
          this.runningTasks.delete(task.id);
          console.log(`[RAG TASK] Task ${task.id} finished.`);
          this.processQueue();
        }
      })();
    }
  }
}
