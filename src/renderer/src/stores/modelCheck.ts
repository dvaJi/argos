import { Store } from '@tanstack/store'

interface ModelCheckState {
  isDialogOpen: boolean
  currentProviderId: string
}

export const modelCheckStore = new Store<ModelCheckState>({
  isDialogOpen: false,
  currentProviderId: ''
})

export const openDialog = (providerId: string) => {
  modelCheckStore.setState({ isDialogOpen: true, currentProviderId: providerId })
}

export const closeDialog = () => {
  modelCheckStore.setState({ isDialogOpen: false, currentProviderId: '' })
}
