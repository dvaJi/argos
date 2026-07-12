import { Store } from "@tanstack/store";
import type { ProviderInstallPreview } from "@argos/shared/presenter";

interface ProviderDeeplinkImportState {
  preview: ProviderInstallPreview | null;
  previewToken: number;
}

export const providerDeeplinkImportStore = new Store<ProviderDeeplinkImportState>({
  preview: null,
  previewToken: 0,
});

export const openPreview = (nextPreview: ProviderInstallPreview) => {
  providerDeeplinkImportStore.setState((prev) => ({
    ...prev,
    previewToken: prev.previewToken + 1,
    preview: { ...nextPreview },
  }));
};

export const clearPreview = () => {
  providerDeeplinkImportStore.setState((prev) => ({ ...prev, preview: null }));
};
