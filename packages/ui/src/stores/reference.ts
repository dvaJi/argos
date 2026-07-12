import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import type { SearchResult } from "@argos/shared/types/core/search";

interface ReferenceState {
  currentReference: SearchResult | undefined;
  showPreview: boolean;
  previewRect: DOMRect | undefined;
}

export const referenceStore = new Store<ReferenceState>({
  currentReference: undefined,
  showPreview: false,
  previewRect: undefined,
});

export const showReference = (reference: SearchResult, rect: DOMRect) => {
  referenceStore.setState((prev) => ({
    ...prev,
    currentReference: reference,
    previewRect: rect,
    showPreview: true,
  }));
};

export const hideReference = () => {
  referenceStore.setState((prev) => ({
    ...prev,
    currentReference: undefined,
    previewRect: undefined,
    showPreview: false,
  }));
};

export function useReferenceStore() {
  const state = useStore(referenceStore);
  return {
    ...state,
    showReference,
    hideReference,
  };
}
