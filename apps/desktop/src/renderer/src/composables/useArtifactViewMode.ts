import { useState, useEffect, useRef, useCallback } from "react";
import type { ArtifactState } from "@/stores/artifact";

const AUTO_PREVIEW_TYPES = new Set(["image/svg+xml", "application/vnd.ant.mermaid", "application/vnd.ant.react"]);

const getDefaultPreviewState = (art: ArtifactState | null): boolean => {
  if (!art) return false;
  if (art.status !== "loaded") return false;
  return AUTO_PREVIEW_TYPES.has(art.type);
};

export function useArtifactViewMode(artifact: ArtifactState | null) {
  const [isPreview, setIsPreview] = useState(false);
  const userHasSetPreviewRef = useRef(false);
  const lastArtifactIdRef = useRef<string | null>(null);

  const setPreview = useCallback((value: boolean) => {
    userHasSetPreviewRef.current = true;
    setIsPreview(value);
  }, []);

  const reset = useCallback(() => {
    setIsPreview(false);
    userHasSetPreviewRef.current = false;
    lastArtifactIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!artifact) {
      setIsPreview(false);
      userHasSetPreviewRef.current = false;
      lastArtifactIdRef.current = null;
      return;
    }

    const isNewArtifact = lastArtifactIdRef.current !== artifact.id;

    if (isNewArtifact) {
      lastArtifactIdRef.current = artifact.id;
      userHasSetPreviewRef.current = false;
      setIsPreview(getDefaultPreviewState(artifact));
    } else if (!userHasSetPreviewRef.current) {
      setIsPreview(getDefaultPreviewState(artifact));
    }
  }, [artifact?.id, artifact?.status]);

  return {
    isPreview,
    setPreview,
    reset,
  };
}
