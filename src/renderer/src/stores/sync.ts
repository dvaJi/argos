import { Store } from '@tanstack/store'
import { createDeviceClient } from '@api/DeviceClient'
import { createSyncClient } from '@api/SyncClient'
import { createConfigClient } from '../../api/ConfigClient'
import type { SyncBackupInfo, CloudSyncConfigView, CloudSyncConfigInput } from '@shared/presenter'

const configClient = createConfigClient()
const syncClient = createSyncClient()
const deviceClient = createDeviceClient()
let syncEventsRegistered = false
let syncSettingsListenerRegistered = false

export const syncStore = new Store({
  syncEnabled: false,
  syncFolderPath: '',
  lastSyncTime: 0,
  isBackingUp: false,
  isImporting: false,
  importResult: null as {
    success: boolean
    message: string
    count?: number
    sourceDbType?: 'agent' | 'chat'
    importedSessions?: number
  } | null,
  cloudConfig: null as CloudSyncConfigView | null,
  isCloudBusy: false,
  backups: [] as SyncBackupInfo[],
  backupsLoading: false
})

export const getSortedBackups = () =>
  [...syncStore.state.backups].sort((a, b) => b.createdAt - a.createdAt)

export const refreshBackups = async () => {
  syncStore.setState((s) => ({ ...s, backupsLoading: true }))
  try {
    const backups = await syncClient.listBackups()
    syncStore.setState((s) => ({ ...s, backups: backups ?? [], backupsLoading: false }))
  } catch (error) {
    console.error('Failed to refresh backup list:', error)
    syncStore.setState((s) => ({ ...s, backupsLoading: false }))
  }
}

export const startBackup = async (): Promise<SyncBackupInfo | null> => {
  const { syncEnabled, isBackingUp } = syncStore.state
  if (!syncEnabled || isBackingUp) return null

  syncStore.setState((s) => ({ ...s, isBackingUp: true }))
  try {
    const backupInfo = await syncClient.startBackup()
    if (backupInfo) {
      await refreshBackups()
    }
    return backupInfo
  } catch (error) {
    console.error('backup failed:', error)
    return null
  } finally {
    syncStore.setState((s) => ({ ...s, isBackingUp: false }))
  }
}

export const importData = async (
  backupFile: string,
  mode: 'increment' | 'overwrite' = 'increment'
) => {
  const { syncEnabled, isImporting } = syncStore.state
  if (!syncEnabled || isImporting || !backupFile) return null

  syncStore.setState((s) => ({ ...s, isImporting: true }))
  try {
    const result = await syncClient.importFromSync(backupFile, mode)
    const importResult = result.success ? null : result
    syncStore.setState((s) => ({ ...s, importResult }))
    return result
  } catch (error) {
    console.error('import failed:', error)
    const importResult = { success: false, message: 'Import failed' }
    syncStore.setState((s) => ({ ...s, importResult }))
    return importResult
  } finally {
    syncStore.setState((s) => ({ ...s, isImporting: false }))
    await refreshBackups()
  }
}

export const loadCloudConfig = async () => {
  try {
    const cloudConfig = await syncClient.getCloudConfig()
    syncStore.setState((s) => ({ ...s, cloudConfig }))
    return cloudConfig
  } catch (error) {
    console.error('load cloud config failed:', error)
    return syncStore.state.cloudConfig
  }
}

export const saveCloudConfig = async (config: CloudSyncConfigInput) => {
  if (syncStore.state.isCloudBusy) return syncStore.state.cloudConfig
  syncStore.setState((s) => ({ ...s, isCloudBusy: true }))
  try {
    const cloudConfig = await syncClient.setCloudConfig(config)
    syncStore.setState((s) => ({ ...s, cloudConfig }))
    return cloudConfig
  } finally {
    syncStore.setState((s) => ({ ...s, isCloudBusy: false }))
  }
}

export const testCloud = async () => {
  if (syncStore.state.isCloudBusy) return null
  syncStore.setState((s) => ({ ...s, isCloudBusy: true }))
  try {
    return await syncClient.testCloudConnection()
  } finally {
    syncStore.setState((s) => ({ ...s, isCloudBusy: false }))
  }
}

export const uploadToCloud = async () => {
  if (syncStore.state.isCloudBusy) return null
  syncStore.setState((s) => ({ ...s, isCloudBusy: true }))
  try {
    return await syncClient.uploadToCloud()
  } finally {
    syncStore.setState((s) => ({ ...s, isCloudBusy: false }))
  }
}

export const pullFromCloud = async (mode: 'increment' | 'overwrite' = 'increment') => {
  if (syncStore.state.isCloudBusy) return null
  syncStore.setState((s) => ({ ...s, isCloudBusy: true }))
  try {
    const result = await syncClient.pullFromCloud(mode)
    if (result && !result.success) {
      syncStore.setState((s) => ({ ...s, importResult: result }))
    }
    return result
  } finally {
    syncStore.setState((s) => ({ ...s, isCloudBusy: false }))
    await refreshBackups()
  }
}

const setupSyncEventListeners = () => {
  if (syncEventsRegistered) return
  syncEventsRegistered = true

  syncClient.onBackupStarted(() => {
    syncStore.setState((s) => ({ ...s, isBackingUp: true }))
  })
  syncClient.onBackupCompleted(({ timestamp }) => {
    syncStore.setState((s) => ({ ...s, isBackingUp: false, lastSyncTime: timestamp }))
  })
  syncClient.onBackupError(() => {
    syncStore.setState((s) => ({ ...s, isBackingUp: false }))
  })
  syncClient.onImportStarted(() => {
    syncStore.setState((s) => ({ ...s, isImporting: true }))
  })
  syncClient.onImportCompleted(() => {
    syncStore.setState((s) => ({ ...s, isImporting: false }))
  })
  syncClient.onImportError(() => {
    syncStore.setState((s) => ({ ...s, isImporting: false }))
  })
}

export const setSyncEnabled = async (enabled: boolean) => {
  syncStore.setState((s) => ({ ...s, syncEnabled: enabled }))
  await configClient.setSyncEnabled(enabled)
}

export const setSyncFolderPath = async (path: string) => {
  syncStore.setState((s) => ({ ...s, syncFolderPath: path }))
  await configClient.setSyncFolderPath(path)
  await refreshBackups()
}

export const selectSyncFolder = async () => {
  const result = await deviceClient.selectDirectory()
  if (result && !result.canceled && result.filePaths.length > 0) {
    await setSyncFolderPath(result.filePaths[0])
  }
}

export const openSyncFolder = async () => {
  if (!syncStore.state.syncEnabled) return
  await syncClient.openSyncFolder()
}

export const restartApp = async () => {
  await deviceClient.restartApp()
}

export const clearImportResult = () => {
  syncStore.setState((s) => ({ ...s, importResult: null }))
}

const setupSyncSettingsListener = () => {
  if (syncSettingsListenerRegistered) return
  syncSettingsListenerRegistered = true
  configClient.onSyncSettingsChanged(async ({ enabled, folderPath }) => {
    const currentPath = syncStore.state.syncFolderPath
    syncStore.setState((s) => ({ ...s, syncEnabled: enabled, syncFolderPath: folderPath }))
    if (folderPath !== currentPath) {
      await refreshBackups()
    }
  })
}

export const initializeSync = async () => {
  const syncEnabled = await configClient.getSyncEnabled()
  const syncFolderPath = await configClient.getSyncFolderPath()
  const status = await syncClient.getBackupStatus()

  syncStore.setState((s) => ({
    ...s,
    syncEnabled,
    syncFolderPath,
    lastSyncTime: status.lastBackupTime,
    isBackingUp: status.isBackingUp
  }))

  await refreshBackups()
  await loadCloudConfig()
  setupSyncEventListeners()
  setupSyncSettingsListener()
}
