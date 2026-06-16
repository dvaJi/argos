import { useMemo } from "react";
import type { MessageFile } from "@shared/types/agent-interface";
import { approximateTokenSize } from "tokenx";

interface ContextLengthOptions {
  inputText: string;
  selectedFiles: MessageFile[];
  contextLength?: number | undefined;
}

export function useContextLength(options: ContextLengthOptions) {
  const { inputText, selectedFiles, contextLength } = options;

  const currentContextLength = useMemo(() => {
    return (
      approximateTokenSize(inputText) +
      selectedFiles.reduce((acc, file) => {
        return acc + (file.token ?? 0);
      }, 0)
    );
  }, [inputText, selectedFiles]);

  const currentContextLengthPercentage = useMemo(() => {
    return currentContextLength / (contextLength ?? 1000);
  }, [currentContextLength, contextLength]);

  const currentContextLengthText = useMemo(() => {
    return `${Math.round(currentContextLengthPercentage * 100)}%`;
  }, [currentContextLengthPercentage]);

  const shouldShowContextLength = useMemo(() => {
    return contextLength != null && contextLength > 0 && currentContextLengthPercentage > 0.5;
  }, [contextLength, currentContextLengthPercentage]);

  const contextLengthStatusClass = useMemo(() => {
    if (currentContextLengthPercentage > 0.9) return "text-red-600";
    if (currentContextLengthPercentage > 0.8) return "text-yellow-600";
    return "text-muted-foreground";
  }, [currentContextLengthPercentage]);

  return {
    currentContextLength,
    currentContextLengthPercentage,
    currentContextLengthText,
    shouldShowContextLength,
    contextLengthStatusClass,
  };
}
