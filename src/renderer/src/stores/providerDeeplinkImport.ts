import { Store } from '@tanstack/store'
import type { ProviderInstallPreview } from '@shared/presenter'

interface ProviderDeeplinkImportState {
  preview: ProviderInstallPreview | null
  previewToken: number
}

export const providerDeeplinkImportStore = new Store<ProviderDeeplinkImportState>({
  preview: null,
  previewToken: 0
})

export const openPreview = (nextPreview: ProviderInstallPreview) => {
  providerDeeplinkImportStore.setState((prev) => ({
    previewToken: prev.previewToken + 1,
    preview: { ...nextPreview }
  }))
}

export const clearPreview = () => {
  providerDeeplinkImportStore.setState({ preview: null })
}
