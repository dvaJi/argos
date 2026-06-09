import { Store } from '@tanstack/store'
import { useStore } from '@tanstack/react-store'
import { createConfigClient } from '../../../api/ConfigClient'
import { createProjectClient } from '@api/ProjectClient'
import type { EnvironmentSummary, Project } from '@shared/types/agent-interface'

export interface UIProject {
  name: string
  path: string
  icon: string | null
  isSynthetic?: boolean
}

type ProjectSelectionSource = 'none' | 'manual' | 'default'

interface ProjectState {
  projects: UIProject[]
  environments: EnvironmentSummary[]
  selectedProjectPath: string | null
  defaultProjectPath: string | null
  selectionSource: ProjectSelectionSource
  error: string | null
}

const configClient = createConfigClient()
const projectClient = createProjectClient()

export const projectStore = new Store<ProjectState>({
  projects: [],
  environments: [],
  selectedProjectPath: null,
  defaultProjectPath: null,
  selectionSource: 'none',
  error: null
})

export const selectedProject = () =>
  projectStore.state.projects.find((p) => p.path === projectStore.state.selectedProjectPath)

const normalizePath = (path: string | null | undefined): string | null => {
  const normalized = path?.trim()
  return normalized ? normalized : null
}

const createSyntheticProject = (projectPath: string): UIProject => ({
  name: projectPath.split(/[/\\]/).pop() ?? projectPath,
  path: projectPath,
  icon: null,
  isSynthetic: true
})

const reconcileProjects = (
  state: Pick<ProjectState, 'selectionSource' | 'selectedProjectPath' | 'defaultProjectPath'>,
  baseProjects: UIProject[]
): UIProject[] => {
  const nextProjects = baseProjects.filter((project) => !project.isSynthetic)
  const syntheticPaths: string[] = []

  if (
    state.selectionSource === 'manual' &&
    state.selectedProjectPath &&
    !nextProjects.some((project) => project.path === state.selectedProjectPath)
  ) {
    syntheticPaths.push(state.selectedProjectPath)
  }

  if (
    state.defaultProjectPath &&
    !nextProjects.some((project) => project.path === state.defaultProjectPath) &&
    !syntheticPaths.includes(state.defaultProjectPath)
  ) {
    syntheticPaths.unshift(state.defaultProjectPath)
  }

  return [...syntheticPaths.map(createSyntheticProject), ...nextProjects]
}

const computeDefaultSelectionUpdates = (
  state: Pick<ProjectState, 'defaultProjectPath' | 'selectionSource'>
): Partial<Pick<ProjectState, 'selectedProjectPath' | 'selectionSource'>> => {
  if (!state.defaultProjectPath) {
    if (state.selectionSource === 'default') {
      return { selectedProjectPath: null, selectionSource: 'none' }
    }
    return {}
  }
  if (state.selectionSource === 'none' || state.selectionSource === 'default') {
    return { selectedProjectPath: state.defaultProjectPath, selectionSource: 'default' }
  }
  return {}
}

const handleDefaultProjectPathChanged = (
  _event?: unknown,
  payload?: string | { path?: string | null }
) => {
  projectStore.setState((prev) => {
    const normalizedPath = normalizePath(
      typeof payload === 'string' ? payload : (payload?.path ?? null)
    )
    const merged = { ...prev, defaultProjectPath: normalizedPath }
    return {
      ...merged,
      projects: reconcileProjects(merged, prev.projects),
      ...computeDefaultSelectionUpdates(merged)
    }
  })
}

export const applyBootstrapDefaultProjectPath = (path: string | null | undefined) => {
  projectStore.setState((prev) => {
    const normalizedPath = normalizePath(path)
    const merged = { ...prev, defaultProjectPath: normalizedPath }
    return {
      ...merged,
      projects: reconcileProjects(merged, prev.projects),
      ...computeDefaultSelectionUpdates(merged)
    }
  })
}

let listenersRegistered = false

function ensureListenersRegistered() {
  if (listenersRegistered) return
  configClient.onDefaultProjectPathChanged(({ path }) => {
    handleDefaultProjectPathChanged(undefined, { path })
  })
  listenersRegistered = true
}

ensureListenersRegistered()

export async function loadDefaultProjectPath(): Promise<void> {
  try {
    applyBootstrapDefaultProjectPath(await configClient.getDefaultProjectPath())
  } catch (e) {
    projectStore.setState((prev) => ({
      ...prev,
      error: `Failed to load default project path: ${e}`
    }))
  }
}

export async function fetchProjects(): Promise<void> {
  try {
    const [result, nextDefaultProjectPath] = await Promise.all([
      projectClient.listRecent(20),
      configClient.getDefaultProjectPath()
    ])

    projectStore.setState((prev) => {
      const normalizedDefault = normalizePath(nextDefaultProjectPath)
      const mapped = (result as Project[]).map((p) => ({
        name: p.name,
        path: p.path,
        icon: p.icon
      }))
      const merged = { ...prev, defaultProjectPath: normalizedDefault }
      return {
        ...merged,
        projects: reconcileProjects(merged, mapped),
        ...computeDefaultSelectionUpdates(merged)
      }
    })
  } catch (e) {
    projectStore.setState((prev) => ({
      ...prev,
      error: `Failed to load projects: ${e}`
    }))
  }
}

export async function fetchEnvironments(): Promise<void> {
  try {
    const envs = await projectClient.listEnvironments()
    projectStore.setState((prev) => ({ ...prev, environments: envs }))
  } catch (e) {
    projectStore.setState((prev) => ({
      ...prev,
      error: `Failed to load environments: ${e}`
    }))
  }
}

export function selectProject(
  path: string | null,
  source: ProjectSelectionSource = normalizePath(path) ? 'manual' : 'none'
): void {
  projectStore.setState((prev) => {
    const normalizedPath = normalizePath(path)
    const nextSource = normalizedPath || source === 'manual' ? source : 'none'
    const merged = { ...prev, selectedProjectPath: normalizedPath, selectionSource: nextSource }
    return { ...merged, projects: reconcileProjects(merged, prev.projects) }
  })
}

export async function setDefaultProject(path: string | null): Promise<void> {
  const normalizedPath = normalizePath(path)
  try {
    await configClient.setDefaultProjectPath(normalizedPath)
    handleDefaultProjectPathChanged(undefined, { path: normalizedPath })
  } catch (e) {
    projectStore.setState((prev) => ({
      ...prev,
      error: `Failed to update default project path: ${e}`
    }))
    throw e
  }
}

export async function clearDefaultProject(): Promise<void> {
  await setDefaultProject(null)
}

export async function openDirectory(path: string): Promise<void> {
  try {
    await projectClient.openDirectory(path)
  } catch (e) {
    projectStore.setState((prev) => ({
      ...prev,
      error: `Failed to open directory: ${e}`
    }))
    throw e
  }
}

export async function refreshEnvironmentData(): Promise<void> {
  await Promise.all([loadDefaultProjectPath(), fetchEnvironments()])
}

export async function openFolderPicker(): Promise<void> {
  try {
    const selectedPath = await projectClient.selectDirectory()
    if (selectedPath) {
      const name = selectedPath.split(/[/\\]/).pop() ?? selectedPath
      projectStore.setState((prev) => {
        const nextProjects = prev.projects.filter((project) => project.path !== selectedPath)
        nextProjects.unshift({ name, path: selectedPath, icon: null })
        return { ...prev, projects: reconcileProjects(prev, nextProjects) }
      })
      selectProject(selectedPath, 'manual')
    }
  } catch (e) {
    projectStore.setState((prev) => ({
      ...prev,
      error: `Failed to open folder picker: ${e}`
    }))
  }
}

export function useProjectStore() {
  return useStore(projectStore)
}
