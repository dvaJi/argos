import type { FileAdapterConstructor } from "@argos/file-adapters/FileAdapterConstructor";
import { detectMimeType, getMimeTypeAdapterMap } from "@argos/file-adapters/mime";
import { UnsupportFileAdapter } from "@argos/file-adapters/UnsupportFileAdapter";
import type { KnowledgeFileIngestionInfo, KnowledgeStorePorts } from "./knowledgeStore";

const DEFAULT_MAX_FILE_SIZE = 1024 * 1024 * 30; // 30MB (same default as the desktop FilePresenter)

function findAdapterForMimeType(
  mimeType: string,
  adapterMap: Map<string, FileAdapterConstructor>,
): FileAdapterConstructor | undefined {
  const exactMatch = adapterMap.get(mimeType);
  if (exactMatch) {
    return exactMatch;
  }

  const type = mimeType.split("/")[0];
  const wildcardMatch = adapterMap.get(`${type}/*`);
  if (wildcardMatch) {
    return wildcardMatch;
  }

  return UnsupportFileAdapter;
}

/**
 * Creates the file side of `KnowledgeStorePorts` on top of `@argos/file-adapters`.
 * Reads the raw ("origin") content of a file for ingestion, mirroring how the
 * desktop FilePresenter's `prepareFileCompletely(path, mime, "origin")` behaved.
 */
export function createFileIngestionPort(
  events: KnowledgeStorePorts["events"],
  options?: { maxFileSize?: number },
): Pick<KnowledgeStorePorts, "detectMime" | "prepareForIngestion"> & { events: KnowledgeStorePorts["events"] } {
  const maxFileSize = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

  return {
    events,
    detectMime: (filePath) => detectMimeType(filePath),
    prepareForIngestion: async (filePath, mimeType) => {
      const adapterMap = getMimeTypeAdapterMap();
      const AdapterConstructor = findAdapterForMimeType(mimeType, adapterMap);
      if (!AdapterConstructor) {
        throw new Error(`No adapter found for file "${filePath}" with determined mime type "${mimeType}"`);
      }

      const adapter = new AdapterConstructor(filePath, maxFileSize);
      await adapter.processFile();

      const info: KnowledgeFileIngestionInfo = {
        name: adapter.fileMetaData?.fileName ?? "",
        content: (await adapter.getContent()) ?? "",
        size: adapter.fileMetaData?.fileSize ?? 0,
      };
      return info;
    },
  };
}
