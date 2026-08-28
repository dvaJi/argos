import { useCallback, useMemo, useRef } from "react";
import type { MessageFile } from "@argos/shared/types/agent-interface";
import { createModelClient } from "#api/ModelClient";
import { findChatSelectableModel } from "#/stores/modelStore";
import { filterUnsupportedAudioAttachments } from "#/lib/audioInputSupport";
import { useToast } from "#/components/use-toast";

export interface ChatModelSelectionRef {
  providerId: string;
  modelId: string;
}

/**
 * Shared attachment pipeline for every surface that submits through the
 * thread composer: drops audio files the resolved model can't ingest (with a
 * toast naming the model) and guards against out-of-order async filter
 * results when the selection changes mid-flight.
 *
 * `getSelection` resolves the model the next message will use. It may be sync
 * (active session) or async (pre-session draft resolution).
 */
export function useModelAwareAttachments(
  getSelection: () => ChatModelSelectionRef | null | Promise<ChatModelSelectionRef | null>,
) {
  const modelClient = useMemo(() => createModelClient(), []);
  const { toast } = useToast();
  const filterTokenRef = useRef(0);

  const notifyUnsupportedAudioAttachments = useCallback(
    (selection: ChatModelSelectionRef, rejectedAudioFiles: MessageFile[]) => {
      if (rejectedAudioFiles.length === 0) return;
      const modelLabel =
        findChatSelectableModel(selection.providerId, selection.modelId)?.model.name ?? selection.modelId;
      toast({
        title: "Audio Input Not Supported",
        description: `${rejectedAudioFiles.length} audio file(s) not supported by ${modelLabel}.`,
      });
    },
    [toast],
  );

  const prepareFiles = useCallback(
    async (files: MessageFile[]): Promise<MessageFile[]> => {
      if (files.length === 0) return files;
      const selection = await getSelection();
      if (!selection) return files;
      try {
        const capabilities = await modelClient.getCapabilities(selection.providerId, selection.modelId);
        if (capabilities.supportsAudioInput !== false) return files;
        const { acceptedFiles, rejectedAudioFiles } = filterUnsupportedAudioAttachments(files, false);
        notifyUnsupportedAudioAttachments(selection, rejectedAudioFiles);
        return acceptedFiles;
      } catch (error) {
        console.warn("[useModelAwareAttachments] Failed to resolve audio input capability:", error);
        return files;
      }
    },
    [getSelection, modelClient, notifyUnsupportedAudioAttachments],
  );

  const handleFilesChange = useCallback(
    async (files: MessageFile[], setFiles: (next: MessageFile[]) => void) => {
      const token = ++filterTokenRef.current;
      const filteredFiles = await prepareFiles(files);
      if (token !== filterTokenRef.current) return;
      setFiles(filteredFiles);
    },
    [prepareFiles],
  );

  return { prepareFiles, handleFilesChange };
}
