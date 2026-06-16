import { useState, useMemo, useEffect, useRef } from "react";
import type { ArtifactState } from "@/stores/artifact";

const getArtifactContextKey = (
  artifact: ArtifactState | null,
  threadId: string | null,
  messageId: string | null,
): string | null => {
  if (!artifact) return null;

  if (threadId && messageId) {
    return `${threadId}:${messageId}:${artifact.id}`;
  }

  return artifact.id;
};

export function useArtifactContext(artifact: ArtifactState | null, threadId: string | null, messageId: string | null) {
  const [componentKey, setComponentKey] = useState(0);
  const isFirstRunRef = useRef(true);

  const activeArtifactContext = useMemo(
    () => getArtifactContextKey(artifact, threadId, messageId),
    [artifact, threadId, messageId],
  );

  useEffect(() => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }
    setComponentKey((k) => k + 1);
  }, [activeArtifactContext]);

  return {
    componentKey,
    activeArtifactContext,
  };
}
