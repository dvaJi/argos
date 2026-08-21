import zod from "zod";
import type { KnowledgeFileMessage, KnowledgeFileResult, QueryResult, TaskQueueStatus } from "@argos/shared/presenter";
import { defineRouteContract } from "../common";

const KnowledgeFileMessageSchema = zod.custom<KnowledgeFileMessage>();
const KnowledgeFileResultSchema = zod.custom<KnowledgeFileResult>();
const QueryResultSchema = zod.custom<QueryResult>();
const TaskQueueStatusSchema = zod.custom<TaskQueueStatus>();

export const KnowledgeFileValidationSchema = zod.object({
  isSupported: zod.boolean(),
  mimeType: zod.string().optional(),
  adapterType: zod.string().optional(),
  error: zod.string().optional(),
  suggestedExtensions: zod.array(zod.string()).optional(),
});

const KnowledgeBaseIdSchema = zod.string().min(1);
const FileIdSchema = zod.string().min(1);

export const knowledgeIsSupportedRoute = defineRouteContract({
  name: "knowledge.isSupported",
  input: zod.object({}),
  output: zod.object({
    supported: zod.boolean(),
  }),
});

export const knowledgeAddFileRoute = defineRouteContract({
  name: "knowledge.addFile",
  input: zod.object({
    id: KnowledgeBaseIdSchema,
    filePath: zod.string().min(1),
  }),
  output: zod.object({
    result: KnowledgeFileResultSchema,
  }),
});

export const knowledgeDeleteFileRoute = defineRouteContract({
  name: "knowledge.deleteFile",
  input: zod.object({
    id: KnowledgeBaseIdSchema,
    fileId: FileIdSchema,
  }),
  output: zod.object({
    deleted: zod.literal(true),
  }),
});

export const knowledgeReAddFileRoute = defineRouteContract({
  name: "knowledge.reAddFile",
  input: zod.object({
    id: KnowledgeBaseIdSchema,
    fileId: FileIdSchema,
  }),
  output: zod.object({
    result: KnowledgeFileResultSchema,
  }),
});

export const knowledgeListFilesRoute = defineRouteContract({
  name: "knowledge.listFiles",
  input: zod.object({
    id: KnowledgeBaseIdSchema,
  }),
  output: zod.object({
    files: zod.array(KnowledgeFileMessageSchema),
  }),
});

export const knowledgeSimilarityQueryRoute = defineRouteContract({
  name: "knowledge.similarityQuery",
  input: zod.object({
    id: KnowledgeBaseIdSchema,
    query: zod.string().min(1),
  }),
  output: zod.object({
    results: zod.array(QueryResultSchema),
  }),
});

export const knowledgeValidateFileRoute = defineRouteContract({
  name: "knowledge.validateFile",
  input: zod.object({
    filePath: zod.string().min(1),
  }),
  output: zod.object({
    result: KnowledgeFileValidationSchema,
  }),
});

export const knowledgeGetSupportedFileExtensionsRoute = defineRouteContract({
  name: "knowledge.getSupportedFileExtensions",
  input: zod.object({}),
  output: zod.object({
    extensions: zod.array(zod.string()),
  }),
});

export const knowledgePauseAllRunningTasksRoute = defineRouteContract({
  name: "knowledge.pauseAllRunningTasks",
  input: zod.object({
    id: KnowledgeBaseIdSchema,
  }),
  output: zod.object({
    paused: zod.literal(true),
  }),
});

export const knowledgeResumeAllPausedTasksRoute = defineRouteContract({
  name: "knowledge.resumeAllPausedTasks",
  input: zod.object({
    id: KnowledgeBaseIdSchema,
  }),
  output: zod.object({
    resumed: zod.literal(true),
  }),
});

export const knowledgeGetTaskQueueStatusRoute = defineRouteContract({
  name: "knowledge.getTaskQueueStatus",
  input: zod.object({}),
  output: zod.object({
    status: TaskQueueStatusSchema,
  }),
});

export const knowledgeResetRoute = defineRouteContract({
  name: "knowledge.reset",
  input: zod.object({}),
  output: zod.object({
    reset: zod.literal(true),
  }),
});
