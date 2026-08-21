import zod from "zod";
import type { KnowledgeFileMessage } from "@argos/shared/presenter";
import { defineEventContract } from "../common";

const KnowledgeFileMessageSchema = zod.custom<KnowledgeFileMessage>();

/** Emitted whenever a knowledge file's status/metadata changes during ingestion. */
export const knowledgeFileUpdatedEvent = defineEventContract({
  name: "knowledge.fileUpdated",
  payload: zod.object({
    file: KnowledgeFileMessageSchema,
    version: zod.number().int(),
  }),
});

/** Emitted per processed chunk to drive per-file ingestion progress bars. */
export const knowledgeFileProgressEvent = defineEventContract({
  name: "knowledge.fileProgress",
  payload: zod.object({
    fileId: zod.string(),
    completed: zod.number().int(),
    error: zod.number().int(),
    total: zod.number().int(),
    version: zod.number().int(),
  }),
});
