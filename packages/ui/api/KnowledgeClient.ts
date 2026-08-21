import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  knowledgeAddFileRoute,
  knowledgeDeleteFileRoute,
  knowledgeGetSupportedFileExtensionsRoute,
  knowledgeGetTaskQueueStatusRoute,
  knowledgeIsSupportedRoute,
  knowledgeListFilesRoute,
  knowledgePauseAllRunningTasksRoute,
  knowledgeReAddFileRoute,
  knowledgeResumeAllPausedTasksRoute,
  knowledgeSimilarityQueryRoute,
  knowledgeValidateFileRoute,
} from "@argos/shared-contracts/routes";
import type { KnowledgeFileMessage, KnowledgeFileResult, QueryResult } from "@argos/shared/presenter";
import { getArgosBridge } from "./core";

export interface KnowledgeFileValidation {
  isSupported: boolean;
  mimeType?: string;
  adapterType?: string;
  error?: string;
  suggestedExtensions?: string[];
}

export interface KnowledgeTaskQueueStatus {
  totalTasks: number;
  runningTasks: number;
  queuedTasks: number;
}

/**
 * Typed client for the daemon-hosted built-in knowledge runtime
 * (ingestion, DuckDB vector stores, similarity search).
 */
export function createKnowledgeClient() {
  const bridge: ArgosBridge = getArgosBridge();

  return {
    async isSupported(): Promise<boolean> {
      const result = await bridge.invoke(knowledgeIsSupportedRoute.name, {});
      return result.supported;
    },

    async addFile(id: string, filePath: string): Promise<KnowledgeFileResult> {
      const result = await bridge.invoke(knowledgeAddFileRoute.name, { id, filePath });
      return result.result;
    },

    async deleteFile(id: string, fileId: string): Promise<void> {
      await bridge.invoke(knowledgeDeleteFileRoute.name, { id, fileId });
    },

    async reAddFile(id: string, fileId: string): Promise<KnowledgeFileResult> {
      const result = await bridge.invoke(knowledgeReAddFileRoute.name, { id, fileId });
      return result.result;
    },

    async listFiles(id: string): Promise<KnowledgeFileMessage[]> {
      const result = await bridge.invoke(knowledgeListFilesRoute.name, { id });
      return result.files;
    },

    async similarityQuery(id: string, query: string): Promise<QueryResult[]> {
      const result = await bridge.invoke(knowledgeSimilarityQueryRoute.name, { id, query });
      return result.results;
    },

    async validateFile(filePath: string): Promise<KnowledgeFileValidation> {
      const result = await bridge.invoke(knowledgeValidateFileRoute.name, { filePath });
      return result.result;
    },

    async getSupportedFileExtensions(): Promise<string[]> {
      const result = await bridge.invoke(knowledgeGetSupportedFileExtensionsRoute.name, {});
      return result.extensions;
    },

    async pauseAllRunningTasks(id: string): Promise<void> {
      await bridge.invoke(knowledgePauseAllRunningTasksRoute.name, { id });
    },

    async resumeAllPausedTasks(id: string): Promise<void> {
      await bridge.invoke(knowledgeResumeAllPausedTasksRoute.name, { id });
    },

    async getTaskQueueStatus(): Promise<KnowledgeTaskQueueStatus> {
      const result = await bridge.invoke(knowledgeGetTaskQueueStatusRoute.name, {});
      return result.status;
    },
  };
}

export type KnowledgeClient = ReturnType<typeof createKnowledgeClient>;
