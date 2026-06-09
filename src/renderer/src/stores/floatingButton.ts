import { Store } from '@tanstack/store'
import { useStore } from '@tanstack/react-store'
import { createConfigClient } from '../../api/ConfigClient'

interface FloatingButtonState {
  enabled: boolean
}

const configClient = createConfigClient()
let listenerRegistered = false

export const floatingButtonStore = new Store<FloatingButtonState>({
  enabled: false
})

export const getFloatingButtonEnabled = async (): Promise<boolean> => {
  try {
    return await configClient.getFloatingButtonEnabled()
  } catch (error) {
    console.error('Failed to get floating button enabled status:', error)
    return false
  }
}

export const setFloatingButtonEnabled = async (value: boolean) => {
  try {
    floatingButtonStore.setState({ enabled: Boolean(value) })
    await configClient.setFloatingButtonEnabled(value)
  } catch (error) {
    console.error('Failed to set floating button enabled status:', error)
    floatingButtonStore.setState({ enabled: !value })
  }
}

const setupFloatingButtonListener = () => {
  if (listenerRegistered) {
    return
  }

  listenerRegistered = true
  configClient.onFloatingButtonChanged((payload) => {
    floatingButtonStore.setState({ enabled: Boolean(payload.enabled) })
  })
}

export const initializeState = async () => {
  try {
    const currentEnabled = await getFloatingButtonEnabled()
    floatingButtonStore.setState({ enabled: currentEnabled })
    setupFloatingButtonListener()
  } catch (error) {
    console.error('Failed to initialize floating button state:', error)
    floatingButtonStore.setState({ enabled: false })
  }
}

export function useFloatingButtonStore() {
  return useStore(floatingButtonStore)
}
