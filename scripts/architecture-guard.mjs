import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.vue'
])

const MAIN_GUARD_PATHS = [
  path.join(ROOT, 'apps/desktop/src/main/presenter/agentSessionPresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/agentRuntimePresenter'),
  path.join(ROOT, 'apps/desktop/src/main/lib/agentRuntime')
]

const RENDERER_SOURCE_ROOT = path.join(ROOT, 'apps/desktop/src/renderer/src')
const RENDERER_TYPED_BOUNDARY_ROOT = path.join(ROOT, 'apps/desktop/src/renderer/api')
const RENDERER_QUARANTINE_ROOT = path.join(ROOT, 'apps/desktop/src/renderer/api/legacy')
const RENDERER_QUARANTINE_ROOTS = [RENDERER_QUARANTINE_ROOT]
const RETIRED_RENDERER_LEGACY_ENTRY_PATHS = [
  path.join(ROOT, 'apps/desktop/src/renderer/src/composables/usePresenter.ts')
]
const RENDERER_QUARANTINE_MAX_SOURCE_FILES = 3
const RENDERER_TYPED_BOUNDARY_WINDOW_API_ALLOWLIST = [
  path.join(ROOT, 'apps/desktop/src/renderer/api/runtime.ts'),
  path.join(ROOT, 'apps/desktop/src/renderer/api/local-api.ts')
]
const MAIN_SOURCE_ROOT = path.join(ROOT, 'apps/desktop/src/main')
const DESKTOP_SOURCE_ROOT = path.join(ROOT, 'apps/desktop/src')
const DAEMON_SOURCE_ROOT = path.join(ROOT, 'apps/daemon/src')
const PHASE_ORDER = new Map([
  ['P0', 0],
  ['P1', 1],
  ['P2', 2],
  ['P3', 3],
  ['P4', 4],
  ['P5', 5]
])
const BRIDGE_REGISTER_PATH = path.join(
  ROOT,
  'docs/architecture/baselines/main-kernel-bridge-register.json'
)

const RENDERER_IPC_GUARD_PATHS = [
  path.join(ROOT, 'apps/desktop/src/renderer/src/App.tsx'),
  path.join(ROOT, 'apps/desktop/src/renderer/src/stores/ui/session.ts'),
  path.join(ROOT, 'apps/desktop/src/renderer/src/stores/ui/message.ts'),
  path.join(ROOT, 'apps/desktop/src/renderer/src/lib/storeInitializer.ts')
]

const MIGRATED_RAW_CHANNEL_GUARD_PATHS = [
  path.join(ROOT, 'apps/desktop/src/renderer/src/App.tsx'),
  path.join(ROOT, 'apps/desktop/src/renderer/src/stores/uiSettingsStore.ts'),
  path.join(ROOT, 'apps/desktop/src/renderer/src/stores/ui/session.ts'),
  path.join(ROOT, 'apps/desktop/src/renderer/src/stores/ui/message.ts'),
  path.join(ROOT, 'apps/desktop/src/renderer/src/stores/ui/agent.ts'),
  path.join(ROOT, 'apps/desktop/src/renderer/src/stores/ui/pendingInput.ts'),
  path.join(ROOT, 'apps/desktop/src/renderer/src/stores/ui/pageRouter.ts'),
  path.join(ROOT, 'apps/desktop/src/renderer/src/pages/ChatPage.tsx'),
  path.join(ROOT, 'apps/desktop/src/renderer/src/pages/NewThreadPage.tsx'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/windowPresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/configPresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/agentSessionPresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/agentRuntimePresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/sessionPresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/llmProviderPresenter'),
  path.join(ROOT, 'apps/desktop/src/shared/contracts'),
  path.join(ROOT, 'apps/desktop/src/renderer/api'),
  path.join(ROOT, 'apps/desktop/src/preload/createBridge.ts'),
  path.join(ROOT, 'apps/desktop/src/preload/bridges'),
  path.join(ROOT, 'apps/desktop/src/main/ipc'),
  path.join(ROOT, 'apps/desktop/src/main/routes')
]

const MIGRATED_RAW_CHANNEL_BASELINE = new Map([
  ['apps/desktop/src/main/presenter/windowPresenter/index.ts', 4],
  ['apps/desktop/src/renderer/src/App.tsx', 1]
])

const HOT_PATH_FILES = [
  path.join(ROOT, 'apps/desktop/src/main/presenter/index.ts'),
  path.join(ROOT, 'apps/desktop/src/main/eventbus.ts'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/agentSessionPresenter/index.ts'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/llmProviderPresenter/index.ts'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/sessionPresenter/index.ts')
]

const HOT_PATH_EDGE_BASELINE = 11

const GENERIC_LEGACY_PRESENTER_CALL_PATTERN =
  /(?<!function\s)\b(?:usePresenter|useLegacyPresenter)\s*\(/g
const LEGACY_PRESENTER_HELPER_CALL_PATTERN =
  /(?<!function\s)\b(?:usePresenter|useLegacyPresenter|useLegacy[A-Z][A-Za-z]*Presenter)\s*\(/g
const LEGACY_PRESENTER_IMPORT_PATTERN =
  /\b(?:import|export)\b[\s\S]*?from\s*['"][^'"]*(?:composables\/usePresenter|legacy\/presenters)['"]|\bimport\s*['"][^'"]*(?:composables\/usePresenter|legacy\/presenters)['"]/g
const WINDOW_ELECTRON_PATTERN = /window\.electron\b/g
const WINDOW_API_PATTERN = /window\.api\b/g
const IPC_RENDERER_LISTENER_PATTERN =
  /window\.electron(?:\?\.|\.)ipcRenderer(?:\?\.|\.)(?:on|once|addListener)\s*\(/g
const INLINE_IPC_CHANNEL_PATTERN =
  /(?:window\.electron(?:\?\.|\.)ipcRenderer|ipcRenderer|ipcMain)(?:\?\.|\.)(?:invoke|send|on|once|handle|handleOnce|removeListener|removeAllListeners|addListener)\s*\(\s*['"`][^'"`]+['"`]/g
const INLINE_EVENTBUS_CHANNEL_PATTERN =
  /(?:sendToRenderer|publish|publishToWindow|publishToWebContents)\s*\(\s*['"`][^'"`]+['"`]/g
const BUN_GLOBAL_PATTERN = /\bBun\./g
const BUN_IMPORT_PATTERN =
  /\b(?:import|export)\b[\s\S]*?from\s*['"]bun:[^'"]+['"]|\bimport\s*['"]bun:[^'"]+['"]/g
const ELECTRON_IMPORT_PATTERN =
  /\b(?:import|export)\b[\s\S]*?from\s*['"]electron(?:\/[^'"]+)?['"]|\bimport\s*['"]electron(?:\/[^'"]+)?['"]/g

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function relativePath(filePath) {
  return toPosix(path.relative(ROOT, filePath))
}

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath))
}

function isUnder(targetPath, parentPath) {
  const normalizedTarget = path.resolve(targetPath)
  const normalizedParent = path.resolve(parentPath)
  return (
    normalizedTarget === normalizedParent ||
    normalizedTarget.startsWith(`${normalizedParent}${path.sep}`)
  )
}

function isRendererQuarantineFile(filePath) {
  return RENDERER_QUARANTINE_ROOTS.some((quarantineRoot) => isUnder(filePath, quarantineRoot))
}

async function pathExists(targetPath) {
  try {
    await fs.stat(targetPath)
    return true
  } catch {
    return false
  }
}

async function collectFiles(entryPath) {
  const stats = await fs.stat(entryPath)
  if (stats.isFile()) {
    return isSourceFile(entryPath) ? [entryPath] : []
  }

  const entries = await fs.readdir(entryPath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const nextPath = path.join(entryPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(nextPath)))
      continue
    }
    if (entry.isFile() && isSourceFile(nextPath)) {
      files.push(nextPath)
    }
  }
  return files
}

function countMatches(source, pattern) {
  let count = 0
  pattern.lastIndex = 0

  while (pattern.exec(source) !== null) {
    count += 1
  }

  pattern.lastIndex = 0
  return count
}

async function resolveImport(specifier, importer, aliasRoot = MAIN_SOURCE_ROOT) {
  const tryFile = async (basePath) => {
    const candidates = [
      basePath,
      `${basePath}.ts`,
      `${basePath}.tsx`,
      `${basePath}.js`,
      `${basePath}.jsx`,
      `${basePath}.vue`,
      `${basePath}.d.ts`,
      path.join(basePath, 'index.ts'),
      path.join(basePath, 'index.tsx'),
      path.join(basePath, 'index.js'),
      path.join(basePath, 'index.jsx'),
      path.join(basePath, 'index.vue'),
      path.join(basePath, 'index.d.ts')
    ]

    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate)
        if (stat.isFile()) {
          return candidate
        }
      } catch {}
    }

    return null
  }

  if (specifier.startsWith('@/')) {
    return await tryFile(path.join(aliasRoot, specifier.slice(2)))
  }

  if (specifier.startsWith('.')) {
    return await tryFile(path.resolve(path.dirname(importer), specifier))
  }

  return null
}

async function collectHotPathDirectEdges() {
  const hotPathFileSet = new Set(HOT_PATH_FILES)
  const edges = []

  for (const filePath of HOT_PATH_FILES) {
    const source = await fs.readFile(filePath, 'utf8')
    const specifiers = extractModuleSpecifiers(source)

    for (const specifier of specifiers) {
      const resolved = await resolveImport(specifier, filePath)
      if (!resolved || !hotPathFileSet.has(resolved)) {
        continue
      }

      edges.push(`${relativePath(filePath)} -> ${relativePath(resolved)}`)
    }
  }

  return edges.sort()
}

async function loadBridgeRegister() {
  const raw = await fs.readFile(BRIDGE_REGISTER_PATH, 'utf8')
  const parsed = JSON.parse(raw)

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('bridge register must be a JSON object')
  }

  if (!PHASE_ORDER.has(parsed.currentPhase)) {
    throw new Error(`unsupported currentPhase: ${String(parsed.currentPhase)}`)
  }

  if (!Array.isArray(parsed.bridges)) {
    throw new Error('bridge register must include a bridges array')
  }

  const currentPhaseOrder = PHASE_ORDER.get(parsed.currentPhase)
  const seenIds = new Set()
  for (const bridge of parsed.bridges) {
    if (!bridge || typeof bridge !== 'object') {
      throw new Error('bridge entries must be JSON objects')
    }

    const requiredFields = [
      'id',
      'owner',
      'legacyEntry',
      'newTarget',
      'introducedIn',
      'deleteByPhase',
      'status',
      'notes'
    ]

    for (const field of requiredFields) {
      if (typeof bridge[field] !== 'string' || bridge[field].trim().length === 0) {
        throw new Error(`bridge entry field ${field} must be a non-empty string`)
      }
    }

    if (!PHASE_ORDER.has(bridge.introducedIn)) {
      throw new Error(`bridge ${bridge.id} has unsupported introducedIn ${bridge.introducedIn}`)
    }

    if (!PHASE_ORDER.has(bridge.deleteByPhase)) {
      throw new Error(`bridge ${bridge.id} has unsupported deleteByPhase ${bridge.deleteByPhase}`)
    }

    if (bridge.status !== 'active' && bridge.status !== 'removed') {
      throw new Error(`bridge ${bridge.id} has unsupported status ${bridge.status}`)
    }

    const deleteByPhaseOrder = PHASE_ORDER.get(bridge.deleteByPhase)
    if (
      bridge.status === 'active' &&
      currentPhaseOrder !== undefined &&
      deleteByPhaseOrder !== undefined &&
      deleteByPhaseOrder <= currentPhaseOrder
    ) {
      throw new Error(
        `bridge ${bridge.id} is active but deleteByPhase ${bridge.deleteByPhase} is at or before currentPhase ${parsed.currentPhase}`
      )
    }

    if (seenIds.has(bridge.id)) {
      throw new Error(`duplicate bridge id ${bridge.id}`)
    }

    seenIds.add(bridge.id)
  }
}

function extractModuleSpecifiers(source) {
  const specifiers = new Set()
  const patterns = [
    /\bimport\s+(?:type\s+)?[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*['"]([^'"]+)['"]/g
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(source)) !== null) {
      specifiers.add(match[1])
    }
  }

  return [...specifiers]
}

async function main() {
  const scanRoots = [path.join(ROOT, 'apps/desktop/src'), path.join(ROOT, 'docs')]
  const fileSet = new Set()

  for (const root of scanRoots) {
    for (const file of await collectFiles(root)) {
      fileSet.add(file)
    }
  }

  const violations = []

  try {
    await loadBridgeRegister()
  } catch (error) {
    violations.push(`[bridge-register-invalid] ${error instanceof Error ? error.message : String(error)}`)
  }

  if (!(await pathExists(RENDERER_QUARANTINE_ROOT))) {
    violations.push(
      `[renderer-quarantine-missing] ${relativePath(RENDERER_QUARANTINE_ROOT)} must exist as the only allowed renderer legacy quarantine directory`
    )
  }

  const quarantineFiles = await collectFiles(RENDERER_QUARANTINE_ROOT)
  if (quarantineFiles.length > RENDERER_QUARANTINE_MAX_SOURCE_FILES) {
    violations.push(
      `[renderer-quarantine-growth] ${relativePath(RENDERER_QUARANTINE_ROOT)} expected <= ${RENDERER_QUARANTINE_MAX_SOURCE_FILES} source files, found ${quarantineFiles.length}`
    )
  }

  for (const retiredEntryPath of RETIRED_RENDERER_LEGACY_ENTRY_PATHS) {
    if (await pathExists(retiredEntryPath)) {
      violations.push(
        `[renderer-retired-legacy-entry] ${relativePath(retiredEntryPath)} must remain deleted`
      )
    }
  }

  for (const filePath of [...fileSet].sort()) {
    const source = await fs.readFile(filePath, 'utf8')
    const specifiers = extractModuleSpecifiers(source)

    if (isUnder(filePath, RENDERER_SOURCE_ROOT)) {
      const file = relativePath(filePath)
      const legacyPresenterHelperCount = countMatches(
        source,
        LEGACY_PRESENTER_HELPER_CALL_PATTERN
      )
      const legacyPresenterImportCount = countMatches(source, LEGACY_PRESENTER_IMPORT_PATTERN)
      const windowElectronCount = countMatches(source, WINDOW_ELECTRON_PATTERN)
      const windowApiCount = countMatches(source, WINDOW_API_PATTERN)
      const actualListenerCount = countMatches(source, IPC_RENDERER_LISTENER_PATTERN)

      if (legacyPresenterImportCount > 0) {
        violations.push(
          `[renderer-business-direct-use-presenter-import] ${file} must not import renderer legacy presenter helpers`
        )
      }

      if (legacyPresenterHelperCount > 0) {
        violations.push(
          `[renderer-business-direct-use-presenter] ${file} expected 0, found ${legacyPresenterHelperCount}`
        )
      }

      if (windowElectronCount > 0) {
        violations.push(
          `[renderer-business-direct-window-electron] ${file} expected 0, found ${windowElectronCount}`
        )
      }

      if (windowApiCount > 0) {
        violations.push(
          `[renderer-business-direct-window-api] ${file} expected 0, found ${windowApiCount}`
        )
      }

      if (actualListenerCount > 0) {
        violations.push(
          `[renderer-business-direct-ipc-listener] ${file} expected 0, found ${actualListenerCount}`
        )
      }
    }

    if (isUnder(filePath, RENDERER_TYPED_BOUNDARY_ROOT) && !isRendererQuarantineFile(filePath)) {
      const file = relativePath(filePath)
      const usePresenterCount = countMatches(source, GENERIC_LEGACY_PRESENTER_CALL_PATTERN)
      const windowElectronCount = countMatches(source, WINDOW_ELECTRON_PATTERN)
      const windowApiCount = countMatches(source, WINDOW_API_PATTERN)
      const allowsWindowApi = RENDERER_TYPED_BOUNDARY_WINDOW_API_ALLOWLIST.some(
        (allowlistedPath) => path.resolve(filePath) === path.resolve(allowlistedPath)
      )

      if (usePresenterCount > 0) {
        violations.push(`[renderer-typed-boundary-direct-use-presenter] ${file}`)
      }

      if (windowElectronCount > 0) {
        violations.push(`[renderer-typed-boundary-direct-window-electron] ${file}`)
      }

      if (windowApiCount > 0 && !allowsWindowApi) {
        violations.push(`[renderer-typed-boundary-direct-window-api] ${file}`)
      }
    }

    if (MIGRATED_RAW_CHANNEL_GUARD_PATHS.some((guardPath) => isUnder(filePath, guardPath))) {
      const file = relativePath(filePath)
      const actualRawChannelCount =
        countMatches(source, INLINE_IPC_CHANNEL_PATTERN) +
        countMatches(source, INLINE_EVENTBUS_CHANNEL_PATTERN)
      const baselineRawChannelCount = MIGRATED_RAW_CHANNEL_BASELINE.get(file) ?? 0

      if (actualRawChannelCount > baselineRawChannelCount) {
        violations.push(
          `[migrated-raw-channel-growth] ${file} expected <= ${baselineRawChannelCount}, found ${actualRawChannelCount}`
        )
      }
    }

    if (isUnder(filePath, DESKTOP_SOURCE_ROOT)) {
      for (const specifier of specifiers) {
        if (specifier.includes('archives/code/')) {
          violations.push(`[archive-import] ${relativePath(filePath)} -> ${specifier}`)
        }
      }

      const bunGlobalCount = countMatches(source, BUN_GLOBAL_PATTERN)
      const bunImportCount = countMatches(source, BUN_IMPORT_PATTERN)
      if (bunGlobalCount > 0) {
        violations.push(`[desktop-bun-global] ${relativePath(filePath)} expected 0, found ${bunGlobalCount}`)
      }
      if (bunImportCount > 0) {
        violations.push(`[desktop-bun-import] ${relativePath(filePath)} expected 0, found ${bunImportCount}`)
      }
    }

    if (MAIN_GUARD_PATHS.some((guardPath) => isUnder(filePath, guardPath))) {
      for (const specifier of specifiers) {
        if (
          specifier === '@/presenter' ||
          specifier === '@/presenter/index' ||
          specifier === '../index' ||
          specifier === '../../index'
        ) {
          violations.push(`[main-global-presenter] ${relativePath(filePath)} -> ${specifier}`)
        }
      }
    }

    if (RENDERER_IPC_GUARD_PATHS.some((guardPath) => isUnder(filePath, guardPath))) {
      if (source.includes('window.electron.ipcRenderer.on(')) {
        violations.push(`[renderer-direct-ipc] ${relativePath(filePath)}`)
      }
      if (source.includes('window.electron.ipcRenderer.removeAllListeners(')) {
        violations.push(`[renderer-remove-all-listeners] ${relativePath(filePath)}`)
      }
    }
  }

  for (const filePath of await collectFiles(DAEMON_SOURCE_ROOT)) {
    const source = await fs.readFile(filePath, 'utf8')
    const specifiers = extractModuleSpecifiers(source)
    const electronImportCount = countMatches(source, ELECTRON_IMPORT_PATTERN)

    if (electronImportCount > 0) {
      violations.push(
        `[daemon-electron-import] ${relativePath(filePath)} expected 0, found ${electronImportCount}`
      )
    }

    for (const specifier of specifiers) {
      if (specifier.includes('archives/code/')) {
        violations.push(`[archive-import] ${relativePath(filePath)} -> ${specifier}`)
      }
    }
  }

  const hotPathEdges = await collectHotPathDirectEdges()
  if (hotPathEdges.length > HOT_PATH_EDGE_BASELINE) {
    violations.push(
      `[hotpath-presenter-edge-growth] expected <= ${HOT_PATH_EDGE_BASELINE}, found ${hotPathEdges.length}`
    )
  }

  // === Shared runtime packages must be Electron-free ===
  const SHARED_PACKAGE_ROOTS = [
    { root: path.join(ROOT, 'packages/acp-runtime/src'), label: '@argos/acp-runtime' },
    { root: path.join(ROOT, 'packages/mcp-runtime/src'), label: '@argos/mcp-runtime' },
    { root: path.join(ROOT, 'packages/skills-runtime/src'), label: '@argos/skills-runtime' },
  ]
  const FORBIDDEN_PACKAGE_IMPORTS = [
    /from\s+['"]electron['"]/,
    /from\s+['"]electron\/[^'"]+['"]/,
    /from\s+['"]@\/eventbus['"]/,
    /from\s+['"]@\/routes['"]/,
    /from\s+['"]@\/routes\//,
    /from\s+['"]@\/lib\/runtimeHelper['"]/,
    /from\s+['"]@\/presenter['"]/,
    /from\s+['"]@\/presenter\//,
    /from\s+['"]@\/events['"]/,
    /from\s+['"]bun:[^'"]+['"]/,
    /\bBun\./,
  ]

  for (const { root, label } of SHARED_PACKAGE_ROOTS) {
    if (!await pathExists(root)) continue
    const pkgFiles = await collectFiles(root)
    for (const file of pkgFiles) {
      const source = await fs.readFile(file, 'utf8')
      for (const pattern of FORBIDDEN_PACKAGE_IMPORTS) {
        if (pattern.test(source)) {
          violations.push(
            `[shared-package-forbidden-import] ${label}: ${relativePath(file)} matches ${pattern}`,
          )
        }
      }
    }
  }

  if (violations.length > 0) {
    console.error('Architecture guard failed.')
    for (const violation of violations) {
      console.error(`- ${violation}`)
    }
    process.exit(1)
  }

  console.log('Architecture guard passed.')
}

main().catch((error) => {
  console.error('Architecture guard failed to run:', error)
  process.exit(1)
})
