import fs from "node:fs";
import path from "node:path";

import {
  BuiltinKnowledgeConfig,
  IVectorDatabasePresenter,
  KnowledgeFileMessage,
  QueryResult,
  IKnowledgeTaskPresenter,
  KnowledgeFileResult,
  KnowledgeChunkMessage,
} from "@argos/shared/presenter";
import { nanoid } from "nanoid";
import { RecursiveCharacterTextSplitter } from "./textSplitters";
import { sanitizeText } from "@argos/shared/strings";
import { getMetric, normalizeDistance } from "@argos/shared/vector";

export interface KnowledgeFileIngestionInfo {
  name: string;
  content: string;
  size: number;
}

/** Host-provided capabilities the knowledge store needs (process-agnostic). */
export interface KnowledgeStorePorts {
  /** Resolve the MIME type of a file on disk. */
  detectMime(filePath: string): Promise<string>;
  /** Read a file for ingestion: raw ("origin") content + name + size. */
  prepareForIngestion(filePath: string, mimeType: string): Promise<KnowledgeFileIngestionInfo>;
  /** Generate embeddings via the configured provider. */
  getEmbeddings(providerId: string, modelId: string, texts: string[]): Promise<number[][]>;
  /** Progress events (bridged to typed daemon events by the host). */
  events: {
    fileUpdated(file: KnowledgeFileMessage): void;
    fileProgress(payload: { fileId: string; completed: number; error: number; total: number }): void;
  };
}

export class KnowledgeStorePresenter {
  private readonly vectorP: IVectorDatabasePresenter;
  private config: BuiltinKnowledgeConfig;
  private taskP: IKnowledgeTaskPresenter;
  private readonly ports: KnowledgeStorePorts;
  // File processing progress tracker
  private fileProgressMap = new Map<string, { completed: number; error: number; total: number }>();
  // --- Added: per-file queue to guarantee vectorP thread safety ---
  private fileQueueMap = new Map<string, Promise<void>>();

  private async enqueueFileTask(fileId: string, task: () => Promise<void>): Promise<void> {
    const last = this.fileQueueMap.get(fileId) ?? Promise.resolve();
    const next = last.then(task).catch((err) => {
      console.error(`[RAG] Error in queued task for file ${fileId}:`, err);
    });
    this.fileQueueMap.set(fileId, next);
    await next;
  }

  constructor(
    vectorP: IVectorDatabasePresenter,
    config: BuiltinKnowledgeConfig,
    taskScheduler: IKnowledgeTaskPresenter,
    ports: KnowledgeStorePorts,
  ) {
    this.vectorP = vectorP;
    this.config = config;
    this.taskP = taskScheduler;
    this.ports = ports;
  }

  /**
   * Get the vector database presenter
   */
  getVectorPresenter(): IVectorDatabasePresenter {
    return this.vectorP;
  }

  updateConfig(config: BuiltinKnowledgeConfig): void {
    this.config = config;
  }

  async addFile(filePath: string, fileId?: string): Promise<KnowledgeFileResult> {
    try {
      if (fs.existsSync(filePath) === false) {
        throw new Error("File does not exist; please check the path");
      }
      // If fileId is empty but filePath already exists in the database, this is a duplicate add — skip
      const existingFile = await this.vectorP.queryFiles({
        path: filePath,
      });
      if (!fileId && existingFile[0]) {
        // Return the file info directly; the frontend must filter
        return { data: existingFile[0] };
      }

      const mimeType = await this.ports.detectMime(filePath);
      // Insert basic file info into the database first
      const fileMessage = {
        id: fileId ?? nanoid(),
        name: path.basename(filePath) || "unknown",
        path: filePath,
        mimeType,
        status: "processing",
        uploadedAt: new Date().getTime(),
        metadata: {
          size: -1, // Initial size unknown
          totalChunks: 0,
        },
      } as KnowledgeFileMessage;

      if (fileId) {
        await this.enqueueFileTask(fileMessage.id, async () => this.vectorP.updateFile(fileMessage));
      } else {
        await this.enqueueFileTask(fileMessage.id, async () => this.vectorP.insertFile(fileMessage));
      }

      this.processFileAsync(fileMessage);

      return { data: fileMessage };
    } catch (error) {
      console.error(`[RAG] Error adding file ${filePath}:`, error);
      // Re-throw the error so the caller can handle it
      throw error;
    }
  }

  // Asynchronously process file reading and chunking (does not participate in the taskPresenter queue)
  private async processFileAsync(fileMessage: KnowledgeFileMessage): Promise<void> {
    try {
      // 1. Read the file and obtain basic info
      const fileInfo = await this.ports.prepareForIngestion(fileMessage.path, fileMessage.mimeType);

      // 2. Update basic file info
      fileMessage.name = fileInfo.name;
      fileMessage.metadata = {
        size: fileInfo.size,
        totalChunks: 0,
      };

      // Inspect file content
      if (fileInfo.content === undefined || fileInfo.content.length === 0) {
        fileMessage.status = "error";
        fileMessage.metadata.errorReason =
          "Could not read file or file is empty; please check whether the file is corrupted or the format is supported";
        await this.enqueueFileTask(fileMessage.id, async () => this.vectorP.updateFile(fileMessage));
        this.ports.events.fileUpdated(fileMessage);
        return;
      }

      // 3. Chunk
      const chunker = new RecursiveCharacterTextSplitter({
        chunkSize: this.config.chunkSize,
        chunkOverlap: this.config.chunkOverlap,
        separators: this.config.separators,
      });
      const chunks = await chunker.splitText(sanitizeText(fileInfo.content));

      // 4. Update the chunk count in the file info
      fileMessage.metadata.totalChunks = chunks.length;
      await this.enqueueFileTask(fileMessage.id, async () => this.vectorP.updateFile(fileMessage));

      // 5. Emit the file updated event
      this.ports.events.fileUpdated(fileMessage);

      // 6. Create chunk records
      const chunkMessages = chunks.map((content, index) => ({
        id: fileMessage.id + "_" + index,
        fileId: fileMessage.id,
        chunkIndex: index,
        content,
        status: "processing",
      })) as KnowledgeChunkMessage[];

      await this.enqueueFileTask(fileMessage.id, async () => this.vectorP.insertChunks(chunkMessages));

      // 7. Initialize file progress tracking
      this.fileProgressMap.set(fileMessage.id, { completed: 0, error: 0, total: chunks.length });

      // 8. Create an independent processing task per chunk and enqueue it in taskPresenter
      for (const chunkMsg of chunkMessages) {
        const chunkTask = {
          id: `chunk_${chunkMsg.id}`,
          payload: {
            knowledgeBaseId: this.config.id,
            fileId: fileMessage.id,
            chunkId: chunkMsg.id,
            taskType: "chunk_processing",
            metadata: {
              content: chunkMsg.content,
              chunkIndex: chunkMsg.chunkIndex,
            },
          },
          run: async ({ signal }: { signal: AbortSignal }) => this.processChunkTask(chunkMsg, signal),
          onSuccess: () => this.handleChunkCompletion(chunkMsg.id, fileMessage.id),
          onError: (error: Error) => this.handleChunkError(chunkMsg.id, fileMessage.id, error.message),
          onTerminate: () => console.log(`[RAG] Chunk processing terminated for ${chunkMsg.id}`),
        };

        this.taskP.addTask(chunkTask);
      }
    } catch (error) {
      console.error(`[RAG] Error in processFileAsync:`, error);
      await this.handleFileProcessingError(fileMessage.id, (error as Error).message);
    }
  }

  // Added: process a single chunk task
  private async processChunkTask(chunkMsg: KnowledgeChunkMessage, signal: AbortSignal): Promise<void> {
    try {
      // Generate vectors
      const vectors = await this.ports.getEmbeddings(this.config.embedding.providerId, this.config.embedding.modelId, [
        chunkMsg.content,
      ]);

      if (!vectors || vectors.length === 0) {
        throw new Error("Failed to generate embeddings");
      }

      if (signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      // Update chunk and vector in a transaction
      await this.enqueueFileTask(chunkMsg.fileId, async () => {
        await this.vectorP.updateChunkStatus(chunkMsg.id, "completed");
        await this.vectorP.insertVector({
          vector: vectors[0],
          fileId: chunkMsg.fileId,
          chunkId: chunkMsg.id,
        });
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      console.error(`[RAG] Error processing chunk ${chunkMsg.id}:`, error);
      throw error;
    }
  }

  // Handle chunk completion event (thread-safe progress management)
  private async handleChunkCompletion(_chunkId: string, fileId: string): Promise<void> {
    const progress = this.fileProgressMap.get(fileId);
    if (!progress) {
      console.warn(`[RAG] No progress tracker found for file ${fileId}`);
      return;
    }
    progress.completed++;

    // Update file progress
    this.ports.events.fileProgress({
      fileId,
      completed: progress.completed,
      error: progress.error,
      total: progress.total,
    });

    // Check whether all chunks are complete
    if (progress.completed + progress.error === progress.total) {
      await this.onFileFinish(fileId);
      // Clean up the progress tracker
      this.fileProgressMap.delete(fileId);
    }
  }

  private async handleChunkError(chunkId: string, fileId: string, errorMessage: string): Promise<void> {
    const progress = this.fileProgressMap.get(fileId);
    if (!progress) {
      console.warn(`[RAG] No progress tracker found for file ${fileId}`);
      return;
    }

    await this.enqueueFileTask(fileId, async () => this.vectorP.updateChunkStatus(chunkId, "error", errorMessage));
    progress.error++;

    // Update file progress
    this.ports.events.fileProgress({
      fileId,
      completed: progress.completed,
      error: progress.error,
      total: progress.total,
    });

    // Check whether all chunks are complete
    if (progress.completed + progress.error === progress.total) {
      await this.onFileFinish(fileId);
      // Clean up the progress tracker
      this.fileProgressMap.delete(fileId);
    }
  }

  // File processing completion callback
  private async onFileFinish(fileId: string): Promise<void> {
    try {
      // TODO: chunk error count
      const fileMessage = await this.vectorP.queryFile(fileId);
      if (fileMessage) {
        fileMessage.status = "completed";
        await this.enqueueFileTask(fileId, async () => this.vectorP.updateFile(fileMessage));
        this.ports.events.fileUpdated(fileMessage);
        console.log(`[RAG] File processing completed for ${fileId}`);
      }
    } catch (error) {
      console.error(`[RAG] Error in onFileFinish for ${fileId}:`, error);
    }
  }

  // Handle file processing errors
  private async handleFileProcessingError(fileId: string, errorMessage: string): Promise<void> {
    try {
      const fileMessage = await this.vectorP.queryFile(fileId);
      if (fileMessage) {
        fileMessage.status = "error";
        if (fileMessage.metadata) {
          fileMessage.metadata.errorReason = errorMessage;
        }
        await this.enqueueFileTask(fileId, async () => this.vectorP.updateFile(fileMessage));
        this.ports.events.fileUpdated(fileMessage);
      }
    } catch (error) {
      console.error(`[RAG] Error handling file processing error for ${fileId}:`, error);
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      // 1. Cancel all pending tasks related to the file (using the convenience method)
      this.taskP.cancelTasksByFile(fileId);

      // 2. Clean up the progress tracker
      this.fileProgressMap.delete(fileId);

      // 3. Delete the file
      await this.enqueueFileTask(fileId, async () => this.vectorP.deleteFile(fileId));
    } catch (err) {
      console.error(`[RAG] Failed to delete file ${fileId} in knowledge base ${this.config.id}:`, err);
      throw err;
    }
  }

  async similarityQuery(key: string): Promise<QueryResult[]> {
    try {
      const embedding = await this.ports.getEmbeddings(
        this.config.embedding.providerId,
        this.config.embedding.modelId,
        [sanitizeText(key)],
      );

      const queryResults = await this.vectorP.similarityQuery(embedding[0], {
        topK: this.config.fragmentsNumber,
        metric: getMetric(this.config.normalized),
      });
      queryResults.forEach((res) => {
        res.distance = normalizeDistance(res.distance, getMetric(this.config.normalized));
      });
      return queryResults;
    } catch (error) {
      console.error(`[RAG] Error during similarity query:`, error);
      throw error;
    }
  }
  async reAddFile(fileId: string): Promise<KnowledgeFileResult> {
    const file = await this.queryFile(fileId);
    if (file == null) {
      throw new Error("File does not exist; please reopen the knowledge base and try again");
    }
    await this.enqueueFileTask(fileId, async () => this.vectorP.deleteChunksByFile(fileId));
    await this.enqueueFileTask(fileId, async () => this.vectorP.deleteVectorsByFile(fileId));
    return this.addFile(file.path, fileId);
  }

  async queryFile(fileId: string): Promise<KnowledgeFileMessage | null> {
    try {
      return await this.vectorP.queryFile(fileId);
    } catch (err) {
      console.error(`[RAG] Failed to query file ${fileId} in knowledge base ${this.config.id}:`, err);
      throw err;
    }
  }
  async listFiles(): Promise<KnowledgeFileMessage[]> {
    try {
      return await this.vectorP.listFiles();
    } catch (err) {
      console.error(`[RAG] Failed to list files in knowledge base ${this.config.id}:`, err);
      throw err;
    }
  }

  async pauseAllRunningTasks(): Promise<void> {
    this.taskP.cancelTasksByKnowledgeBase(this.config.id);
    this.fileProgressMap.clear();
    await this.vectorP.pauseAllRunningTasks();
  }
  async resumeAllPausedTasks(): Promise<void> {
    // query all paused chunks
    const pausedChunkMessages = await this.vectorP.queryChunks({ status: "paused" });
    // count by file id
    const fileIdCountMap = new Map<string, number>();
    pausedChunkMessages.forEach((chunk) => {
      const count = fileIdCountMap.get(chunk.fileId) || 0;
      fileIdCountMap.set(chunk.fileId, count + 1);
    });
    // resume file progress cache
    fileIdCountMap.forEach((count, fileId) => {
      this.fileProgressMap.set(fileId, {
        completed: 0,
        error: 0,
        total: count,
      });
    });
    await this.vectorP.resumeAllPausedTasks();
    for (const chunkMessage of pausedChunkMessages) {
      // re-add each paused chunk to the task queue
      const chunkTask = {
        id: `chunk_${chunkMessage.id}`,
        payload: {
          knowledgeBaseId: this.config.id,
          fileId: chunkMessage.fileId,
          chunkId: chunkMessage.id,
          taskType: "chunk_processing",
          metadata: {
            content: chunkMessage.content,
            chunkIndex: chunkMessage.chunkIndex,
          },
        },
        run: async ({ signal }: { signal: AbortSignal }) => this.processChunkTask(chunkMessage, signal),
        onSuccess: () => this.handleChunkCompletion(chunkMessage.id, chunkMessage.fileId),
        onError: (error: Error) => this.handleChunkError(chunkMessage.id, chunkMessage.fileId, error.message),
        onTerminate: () => console.log(`[RAG] Chunk processing terminated for ${chunkMessage.id}`),
      };
      this.taskP.addTask(chunkTask);
    }
  }

  async destroy(): Promise<void> {
    try {
      // Stop all tasks (using the convenience method)
      this.taskP.cancelTasksByKnowledgeBase(this.config.id);
      // Clean up all progress trackers
      this.fileProgressMap.clear();
      this.vectorP.destroy();
    } catch (err) {
      console.error(`[RAG] Error destroying knowledge base ${this.config.id}:`, err);
    }
  }

  async close(): Promise<void> {
    try {
      // Stop all tasks (using the convenience method)
      this.taskP.cancelTasksByKnowledgeBase(this.config.id);
      // Clean up all progress trackers
      this.fileProgressMap.clear();
      await this.pauseAllRunningTasks();
      this.vectorP.close();
    } catch (err) {
      console.error(`[RAG] Error closing knowledge base ${this.config.id}:`, err);
    }
  }
}
