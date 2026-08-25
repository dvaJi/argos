import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const REPORT_DIR = path.join(ROOT, 'docs/architecture/baselines')
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue', '.d.ts'])
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build'])
const PHASE_ORDER = new Map([
  ['P0', 0],
  ['P1', 1],
  ['P2', 2],
  ['P3', 3],
  ['P4', 4],
  ['P5', 5]
])

const ANALYSIS_TARGETS = [
  {
    label: 'main',
    root: path.join(ROOT, 'apps/desktop/src/main')
  },
  {
    label: 'renderer',
    root: path.join(ROOT, 'packages/ui/src')
  }
]

const MAIN_SOURCE_ROOT = path.join(ROOT, 'apps/desktop/src/main')
const RENDERER_SOURCE_ROOT = path.join(ROOT, 'packages/ui/src')
const BRIDGE_REGISTER_PATH = path.join(
  ROOT,
  'docs/architecture/baselines/main-kernel-bridge-register.json'
)

const HOT_PATH_FILES = [
  path.join(ROOT, 'apps/desktop/src/main/presenter/index.ts'),
  path.join(ROOT, 'apps/desktop/src/main/eventbus.ts'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/agentSessionPresenter/index.ts'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/llmProviderPresenter/index.ts'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/sessionPresenter/index.ts')
]

const MIGRATED_RAW_CHANNEL_GUARD_PATHS = [
  path.join(ROOT, 'packages/ui/src/App.tsx'),
  path.join(ROOT, 'packages/ui/src/stores/uiSettingsStore.ts'),
  path.join(ROOT, 'packages/ui/src/stores/ui/session.ts'),
  path.join(ROOT, 'packages/ui/src/stores/ui/message.ts'),
  path.join(ROOT, 'packages/ui/src/stores/ui/agent.ts'),
  path.join(ROOT, 'packages/ui/src/stores/ui/pendingInput.ts'),
  path.join(ROOT, 'packages/ui/src/stores/ui/pageRouter.ts'),
  path.join(ROOT, 'packages/ui/src/pages/ChatPage.tsx'),
  path.join(ROOT, 'packages/ui/src/pages/NewThreadPage.tsx'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/windowPresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/configPresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/agentSessionPresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/agentRuntimePresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/sessionPresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/llmProviderPresenter'),
  path.join(ROOT, 'apps/desktop/src/shared/contracts'),
  path.join(ROOT, 'packages/ui/api'),
  path.join(ROOT, 'apps/desktop/src/preload/createBridge.ts'),
  path.join(ROOT, 'apps/desktop/src/preload/bridges'),
  path.join(ROOT, 'apps/desktop/src/main/ipc'),
  path.join(ROOT, 'apps/desktop/src/main/routes')
]

const GENERIC_LEGACY_PRESENTER_CALL_PATTERN =
  /(?<!function\s)\b(?:usePresenter|useLegacyPresenter)\s*\(/g
const LEGACY_PRESENTER_HELPER_CALL_PATTERN =
  /(?<!function\s)\b(?:usePresenter|useLegacyPresenter|useLegacy[A-Z][A-Za-z]*Presenter)\s*\(/g
const WINDOW_ELECTRON_PATTERN = /window\.electron\b/g
const WINDOW_API_PATTERN = /window\.api\b/g
const RAW_TIMER_PATTERN = /\b(?:setTimeout|setInterval)\s*\(/g
const INLINE_IPC_CHANNEL_PATTERN =
  /(?:window\.electron(?:\?\.|\.)ipcRenderer|ipcRenderer|ipcMain)(?:\?\.|\.)(?:invoke|send|on|once|handle|handleOnce|removeListener|removeAllListeners|addListener)\s*\(\s*['"`][^'"`]+['"`]/g
const INLINE_EVENTBUS_CHANNEL_PATTERN =
  /(?:sendToRenderer|publish|publishToWindow|publishToWebContents)\s*\(\s*['"`][^'"`]+['"`]/g
const PRESENTER_PHASE_GATES = {
  P2: ['configPresenter', 'llmproviderPresenter'],
  P3: [
    'windowPresenter',
    'devicePresenter',
    'workspacePresenter',
    'projectPresenter',
    'filePresenter',
    'yoBrowserPresenter',
    'tabPresenter'
  ],
  P4: [
    'agentSessionPresenter',
    'skillPresenter',
    'mcpPresenter',
    'syncPresenter',
    'upgradePresenter',
    'dialogPresenter',
    'toolPresenter'
  ]
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function relativePath(filePath) {
  return toPosix(path.relative(ROOT, filePath))
}

function isUnder(targetPath, parentPath) {
  const normalizedTarget = path.resolve(targetPath)
  const normalizedParent = path.resolve(parentPath)
  return (
    normalizedTarget === normalizedParent ||
    normalizedTarget.startsWith(`${normalizedParent}${path.sep}`)
  )
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function walk(dirPath, output = []) {
  let stats = null

  try {
    stats = await fs.stat(dirPath)
  } catch {
    return output
  }

  if (stats.isFile()) {
    if (SOURCE_EXTENSIONS.has(path.extname(dirPath))) {
      output.push(dirPath)
    }

    return output
  }

  let entries = []

  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return output
  }

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) {
      continue
    }

    const nextPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      await walk(nextPath, output)
      continue
    }

    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      output.push(nextPath)
    }
  }

  return output
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function createUsePresenterNamePattern(presenterName) {
  return new RegExp(
    `(?<!function\\s)\\b(?:usePresenter|useLegacyPresenter)\\s*\\(\\s*['"\`]${escapeRegExp(presenterName)}['"\`]`,
    'g'
  )
}

function extractSpecifiers(source) {
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

async function resolveImport(specifier, importer, scopeRoot) {
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

  if (specifier.startsWith('#/')) {
    return await tryFile(path.join(scopeRoot, specifier.slice(2)))
  }

  if (specifier.startsWith('@argos/shared/')) {
    return await tryFile(path.join(ROOT, 'apps/desktop/src/shared', specifier.slice('@argos/shared/'.length)))
  }

  if (specifier.startsWith('.')) {
    return await tryFile(path.resolve(path.dirname(importer), specifier))
  }

  return null
}

async function analyzeScope(label, scopeRoot) {
  const files = await walk(scopeRoot)
  const fileSet = new Set(files)
  const edges = new Map(files.map((file) => [file, new Set()]))
  const reverseEdges = new Map(files.map((file) => [file, new Set()]))

  for (const file of files) {
    const source = await Bun.file(file).text()
    for (const specifier of extractSpecifiers(source)) {
      const resolved = await resolveImport(specifier, file, scopeRoot)
      if (!resolved || !fileSet.has(resolved)) {
        continue
      }

      edges.get(file).add(resolved)
      reverseEdges.get(resolved).add(file)
    }
  }

  const cycles = []
  const cycleKeys = new Set()
  const visiting = new Set()
  const visited = new Set()
  const stack = []

  function traverse(node) {
    visiting.add(node)
    stack.push(node)

    for (const next of edges.get(node)) {
      if (!visiting.has(next) && !visited.has(next)) {
        traverse(next)
        continue
      }

      if (visiting.has(next)) {
        const startIndex = stack.indexOf(next)
        const cycle = stack.slice(startIndex).concat(next)
        const key = cycle
          .slice(0, -1)
          .map((file) => path.relative(scopeRoot, file))
          .sort()
          .join('|')

        if (!cycleKeys.has(key)) {
          cycleKeys.add(key)
          cycles.push(cycle)
        }
      }
    }

    stack.pop()
    visiting.delete(node)
    visited.add(node)
  }

  for (const file of files) {
    if (!visited.has(file)) {
      traverse(file)
    }
  }

  const topOutgoing = [...edges.entries()]
    .map(([file, refs]) => ({
      file: path.relative(scopeRoot, file),
      count: refs.size
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 15)

  const topIncoming = [...reverseEdges.entries()]
    .map(([file, refs]) => ({
      file: path.relative(scopeRoot, file),
      count: refs.size
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 15)

  const zeroInbound = [...reverseEdges.entries()]
    .filter(([, refs]) => refs.size === 0)
    .map(([file]) => path.relative(scopeRoot, file))
    .filter((file) => !/index\.(ts|tsx|js|jsx|vue|d\.ts)$/.test(file))
    .sort()

  return {
    label,
    totalFiles: files.length,
    totalEdges: [...edges.values()].reduce((sum, refs) => sum + refs.size, 0),
    cycles: cycles.map((cycle) => cycle.map((file) => path.relative(scopeRoot, file))),
    topOutgoing,
    topIncoming,
    zeroInbound
  }
}

async function collectArchiveReferences() {
  const scanRoots = [path.join(ROOT, 'docs'), path.join(ROOT, 'apps/desktop/src')]
  const references = []

  for (const scanRoot of scanRoots) {
    const files = await walk(scanRoot)
    for (const file of files) {
      const source = await Bun.file(file).text()
      const lines = source.split('\n')

      lines.forEach((line, index) => {
        if (!line.includes('archives/code/')) {
          return
        }

        references.push({
          file: toPosix(path.relative(ROOT, file)),
          line: index + 1,
          text: line.trim()
        })
      })
    }
  }

  return references.sort((left, right) =>
    `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`)
  )
}

async function collectFilesFromTargets(targets) {
  const files = []

  for (const target of targets) {
    const targetFiles = await walk(target)
    for (const file of targetFiles) {
      files.push(file)
    }
  }

  return [...new Set(files)].sort()
}

async function collectPatternCounts(files, pattern) {
  const counts = new Map()

  for (const file of files) {
    const source = await Bun.file(file).text()
    const count = countMatches(source, pattern)
    if (count > 0) {
      counts.set(relativePath(file), count)
    }
  }

  return counts
}

async function collectPresenterFamilyCounts(files, presenterNames) {
  const patterns = presenterNames.map((presenterName) => [
    presenterName,
    createUsePresenterNamePattern(presenterName)
  ])
  const counts = Object.fromEntries(presenterNames.map((presenterName) => [presenterName, 0]))

  for (const file of files) {
    const source = await Bun.file(file).text()
    for (const [presenterName, pattern] of patterns) {
      counts[presenterName] += countMatches(source, pattern)
    }
  }

  return counts
}

async function collectRendererPatternCounts(pattern) {
  const businessFiles = await walk(RENDERER_SOURCE_ROOT)
  return collectPatternCounts(businessFiles, pattern)
}

async function collectMigratedRawChannelCounts() {
  const files = await collectFilesFromTargets(MIGRATED_RAW_CHANNEL_GUARD_PATHS)
  const counts = new Map()

  for (const file of files) {
    const source = await Bun.file(file).text()
    const count =
      countMatches(source, INLINE_IPC_CHANNEL_PATTERN) +
      countMatches(source, INLINE_EVENTBUS_CHANNEL_PATTERN)

    if (count > 0) {
      counts.set(relativePath(file), count)
    }
  }

  return counts
}

async function collectHotPathDirectEdges() {
  const hotPathFileSet = new Set(HOT_PATH_FILES)
  const edges = []

  for (const file of HOT_PATH_FILES) {
    const source = await Bun.file(file).text()
    for (const specifier of extractSpecifiers(source)) {
      const resolved = await resolveImport(specifier, file, MAIN_SOURCE_ROOT)
      if (!resolved || !hotPathFileSet.has(resolved)) {
        continue
      }

      edges.push({
        source: relativePath(file),
        target: relativePath(resolved)
      })
    }
  }

  return edges.sort((left, right) =>
    `${left.source}->${left.target}`.localeCompare(`${right.source}->${right.target}`)
  )
}

async function loadBridgeRegister() {
  const raw = await Bun.file(BRIDGE_REGISTER_PATH).text()
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

    if (!PHASE_ORDER.has(bridge.deleteByPhase)) {
      throw new Error(`bridge ${bridge.id} has unsupported deleteByPhase ${bridge.deleteByPhase}`)
    }

    if (bridge.status !== 'active' && bridge.status !== 'removed') {
      throw new Error(`bridge ${bridge.id} has unsupported status ${bridge.status}`)
    }

    if (seenIds.has(bridge.id)) {
      throw new Error(`duplicate bridge id ${bridge.id}`)
    }

    seenIds.add(bridge.id)
  }

  return parsed
}

function summarizeCounts(counts) {
  const items = [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1]
    }

    return left[0].localeCompare(right[0])
  })

  return {
    total: items.reduce((sum, [, count]) => sum + count, 0),
    top: items.slice(0, 12)
  }
}

function summarizeBridges(register) {
  const currentPhaseOrder = PHASE_ORDER.get(register.currentPhase)
  let activeCount = 0
  let expiredCount = 0

  for (const bridge of register.bridges) {
    if (bridge.status !== 'active') {
      continue
    }

    activeCount += 1
    if (PHASE_ORDER.get(bridge.deleteByPhase) < currentPhaseOrder) {
      expiredCount += 1
    }
  }

  return { activeCount, expiredCount }
}

function renderDependencyReport(scopes) {
  const lines = [
    '# Dependency Baseline',
    '',
    `Generated on ${new Date().toISOString().slice(0, 10)}.`,
    ''
  ]

  for (const scope of scopes) {
    lines.push(`## ${scope.label}`)
    lines.push('')
    lines.push(`- Total files: ${scope.totalFiles}`)
    lines.push(`- Internal dependency edges: ${scope.totalEdges}`)
    lines.push(`- Cycles detected: ${scope.cycles.length}`)
    lines.push('')
    lines.push('### Top outgoing dependencies')
    lines.push('')

    for (const item of scope.topOutgoing) {
      lines.push(`- \`${item.file}\`: ${item.count}`)
    }

    lines.push('')
    lines.push('### Top incoming dependencies')
    lines.push('')

    for (const item of scope.topIncoming) {
      lines.push(`- \`${item.file}\`: ${item.count}`)
    }

    lines.push('')
    lines.push('### Cycle samples')
    lines.push('')

    if (scope.cycles.length === 0) {
      lines.push('- None')
    } else {
      for (const cycle of scope.cycles.slice(0, 20)) {
        lines.push(`- \`${cycle.join(' -> ')}\``)
      }
    }

    lines.push('')
  }

  return lines.join('\n')
}

function renderZeroInboundReport(scopes) {
  const lines = [
    '# Zero Inbound Candidates',
    '',
    `Generated on ${new Date().toISOString().slice(0, 10)}.`,
    '',
    'These files have no in-repo importers inside their scope and need manual classification before deletion.',
    ''
  ]

  for (const scope of scopes) {
    lines.push(`## ${scope.label}`)
    lines.push('')
    lines.push(`- Candidate count: ${scope.zeroInbound.length}`)
    lines.push('')
    for (const file of scope.zeroInbound) {
      lines.push(`- \`${file}\``)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function renderArchiveReferenceReport(references) {
  const lines = [
    '# Archive Reference Baseline',
    '',
    `Generated on ${new Date().toISOString().slice(0, 10)}.`,
    '',
    `- Total references: ${references.length}`,
    ''
  ]

  for (const reference of references) {
    lines.push(`- \`${reference.file}:${reference.line}\` ${reference.text}`)
  }

  return lines.join('\n')
}

function renderTopCountSection(lines, title, summary) {
  lines.push(`## ${title}`)
  lines.push('')
  lines.push(`- Total count: ${summary.total}`)
  lines.push('')

  if (summary.top.length === 0) {
    lines.push('- None')
  } else {
    for (const [file, count] of summary.top) {
      lines.push(`- \`${file}\`: ${count}`)
    }
  }

  lines.push('')
}

function renderBoundaryBaselineReport({
  currentPhase,
  metrics,
  rendererCounts,
  phaseGates,
  usePresenterSummary,
  windowElectronSummary,
  windowApiSummary,
  rawTimerSummary,
  migratedRawChannelSummary,
  hotPathEdges
}) {
  const lines = [
    '# Main Kernel Boundary Baseline',
    '',
    `Generated on ${new Date().toISOString().slice(0, 10)}.`,
    `Current phase: ${currentPhase}.`,
    '',
    '## Metric Snapshot',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| \`renderer.usePresenter.count\` | ${metrics['renderer.usePresenter.count']} |`,
    `| \`renderer.windowElectron.count\` | ${metrics['renderer.windowElectron.count']} |`,
    `| \`renderer.windowApi.count\` | ${metrics['renderer.windowApi.count']} |`,
    `| \`hotpath.presenterEdge.count\` | ${metrics['hotpath.presenterEdge.count']} |`,
    `| \`runtime.rawTimer.count\` | ${metrics['runtime.rawTimer.count']} |`,
    `| \`migrated.rawChannel.count\` | ${metrics['migrated.rawChannel.count']} |`,
    `| \`bridge.active.count\` | ${metrics['bridge.active.count']} |`,
    `| \`bridge.expired.count\` | ${metrics['bridge.expired.count']} |`,
    ''
  ]

  lines.push('## Renderer Legacy Surfaces')
  lines.push('')
  lines.push('- Business layer: `packages/ui/src/**`')
  lines.push('')
  lines.push('| Legacy surface | Count |')
  lines.push('| --- | --- |')
  lines.push(`| legacy presenter helper | ${rendererCounts.usePresenter.total} |`)
  lines.push(`| \`window.electron\` | ${rendererCounts.windowElectron.total} |`)
  lines.push(`| \`window.api\` | ${rendererCounts.windowApi.total} |`)
  lines.push('')

  lines.push('## Phase Gates')
  lines.push('')
  lines.push('| Phase | Gate indicator | Current signal | Status |')
  lines.push('| --- | --- | --- | --- |')
  for (const gate of phaseGates) {
    lines.push(`| \`${gate.phase}\` | ${gate.indicator} | ${gate.current} | ${gate.status} |`)
  }
  lines.push('')

  lines.push('## Hot Path Direct Dependencies')
  lines.push('')
  lines.push(`- Direct edge count: ${hotPathEdges.length}`)
  lines.push('')

  if (hotPathEdges.length === 0) {
    lines.push('- None')
  } else {
    for (const edge of hotPathEdges) {
      lines.push(`- \`${edge.source} -> ${edge.target}\``)
    }
  }

  lines.push('')

  renderTopCountSection(lines, 'Renderer legacy presenter helpers', usePresenterSummary)
  renderTopCountSection(lines, 'Renderer window.electron', windowElectronSummary)
  renderTopCountSection(lines, 'Renderer window.api', windowApiSummary)
  renderTopCountSection(lines, 'Raw Timers', rawTimerSummary)
  renderTopCountSection(lines, 'Migrated Path Raw Channel Literals', migratedRawChannelSummary)

  return lines.join('\n')
}

function renderMigrationScoreboardReport({ currentPhase, metrics, phaseGates }) {
  const lines = [
    '# Main Kernel Migration Scoreboard',
    '',
    `Generated on ${new Date().toISOString().slice(0, 10)}.`,
    `Current phase: ${currentPhase}.`,
    '',
    'Phase 0 establishes the comparison baseline. Later phases should update this report and compare against this checkpoint.',
    '',
    '| Metric | Value | Status |',
    '| --- | --- | --- |'
  ]

  for (const [metric, value] of Object.entries(metrics)) {
    lines.push(`| \`${metric}\` | ${value} | baseline |`)
  }

  lines.push('')
  lines.push('## Phase Gate Status')
  lines.push('')
  lines.push('| Phase | Status | Current signal |')
  lines.push('| --- | --- | --- |')
  for (const gate of phaseGates) {
    lines.push(`| \`${gate.phase}\` | ${gate.status} | ${gate.current} |`)
  }
  lines.push('')
  return lines.join('\n')
}

function renderBridgeRegisterReport(register, bridgeSummary) {
  const lines = [
    '# Main Kernel Bridge Register',
    '',
    `Updated on ${register.updatedOn}.`,
    `Current phase: ${register.currentPhase}.`,
    '',
    `- Active bridges: ${bridgeSummary.activeCount}`,
    `- Expired bridges: ${bridgeSummary.expiredCount}`,
    ''
  ]

  if (register.bridges.length === 0) {
    lines.push('## Entries')
    lines.push('')
    lines.push('- None')
    lines.push('')
    return lines.join('\n')
  }

  lines.push('## Entries')
  lines.push('')
  lines.push('| id | owner | legacyEntry | newTarget | introducedIn | deleteByPhase | status | notes |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')

  for (const bridge of register.bridges) {
    lines.push(
      `| ${bridge.id} | ${bridge.owner} | ${bridge.legacyEntry} | ${bridge.newTarget} | ${bridge.introducedIn} | ${bridge.deleteByPhase} | ${bridge.status} | ${bridge.notes} |`
    )
  }

  lines.push('')
  return lines.join('\n')
}

async function main() {
  await ensureDir(REPORT_DIR)
  const scopes = []

  for (const target of ANALYSIS_TARGETS) {
    scopes.push(await analyzeScope(target.label, target.root))
  }

  const archiveReferences = await collectArchiveReferences()
  const mainAndRendererFiles = await collectFilesFromTargets([MAIN_SOURCE_ROOT, RENDERER_SOURCE_ROOT])
  const rendererBusinessFiles = await walk(RENDERER_SOURCE_ROOT)
  const usePresenterCounts = await collectRendererPatternCounts(LEGACY_PRESENTER_HELPER_CALL_PATTERN)
  const windowElectronCounts = await collectRendererPatternCounts(WINDOW_ELECTRON_PATTERN)
  const windowApiCounts = await collectRendererPatternCounts(WINDOW_API_PATTERN)
  const rawTimerCounts = await collectPatternCounts(mainAndRendererFiles, RAW_TIMER_PATTERN)
  const migratedRawChannelCounts = await collectMigratedRawChannelCounts()
  const hotPathEdges = await collectHotPathDirectEdges()
  const bridgeRegister = await loadBridgeRegister()
  const bridgeSummary = summarizeBridges(bridgeRegister)
  const p2PresenterCounts = await collectPresenterFamilyCounts(
    rendererBusinessFiles,
    PRESENTER_PHASE_GATES.P2
  )
  const p3PresenterCounts = await collectPresenterFamilyCounts(
    rendererBusinessFiles,
    PRESENTER_PHASE_GATES.P3
  )
  const p4PresenterCounts = await collectPresenterFamilyCounts(
    rendererBusinessFiles,
    PRESENTER_PHASE_GATES.P4
  )

  const rendererCounts = {
    usePresenter: summarizeCounts(usePresenterCounts),
    windowElectron: summarizeCounts(windowElectronCounts),
    windowApi: summarizeCounts(windowApiCounts)
  }

  const metrics = {
    'renderer.usePresenter.count': rendererCounts.usePresenter.total,
    'renderer.windowElectron.count': rendererCounts.windowElectron.total,
    'renderer.windowApi.count': rendererCounts.windowApi.total,
    'hotpath.presenterEdge.count': hotPathEdges.length,
    'runtime.rawTimer.count': summarizeCounts(rawTimerCounts).total,
    'migrated.rawChannel.count': summarizeCounts(migratedRawChannelCounts).total,
    'bridge.active.count': bridgeSummary.activeCount,
    'bridge.expired.count': bridgeSummary.expiredCount
  }

  const usePresenterSummary = rendererCounts.usePresenter
  const windowElectronSummary = rendererCounts.windowElectron
  const windowApiSummary = rendererCounts.windowApi
  const rawTimerSummary = summarizeCounts(rawTimerCounts)
  const migratedRawChannelSummary = summarizeCounts(migratedRawChannelCounts)
  const p1Ready =
    metrics['renderer.usePresenter.count'] === 0 &&
    metrics['renderer.windowElectron.count'] === 0 &&
    metrics['renderer.windowApi.count'] === 0
  const p2Ready = Object.values(p2PresenterCounts).every((count) => count === 0)
  const p3Ready = Object.values(p3PresenterCounts).every((count) => count === 0)
  const p4Ready = Object.values(p4PresenterCounts).every((count) => count === 0)
  const phaseGates = [
    {
      phase: 'P1',
      indicator:
        'Business layer legacy presenter helper / `window.electron` / `window.api` counts must reach `0`',
      current:
        `legacyPresenter=${metrics['renderer.usePresenter.count']}, ` +
        `window.electron=${metrics['renderer.windowElectron.count']}, ` +
        `window.api=${metrics['renderer.windowApi.count']}`,
      status: p1Ready ? 'ready' : 'pending'
    },
    {
      phase: 'P2',
      indicator: 'Business layer `configPresenter` and `llmproviderPresenter` hits must reach `0`',
      current:
        `configPresenter=${p2PresenterCounts.configPresenter}, ` +
        `llmproviderPresenter=${p2PresenterCounts.llmproviderPresenter}`,
      status: p2Ready ? 'ready' : 'pending'
    },
    {
      phase: 'P3',
      indicator:
        'Business layer window/device/workspace/project/file/browser/tab presenter hits must reach `0`',
      current:
        `window=${p3PresenterCounts.windowPresenter}, ` +
        `device=${p3PresenterCounts.devicePresenter}, ` +
        `workspace=${p3PresenterCounts.workspacePresenter}, ` +
        `project=${p3PresenterCounts.projectPresenter}, ` +
        `file=${p3PresenterCounts.filePresenter}, ` +
        `browser=${p3PresenterCounts.yoBrowserPresenter}, ` +
        `tab=${p3PresenterCounts.tabPresenter}`,
      status: p3Ready ? 'ready' : 'pending'
    },
    {
      phase: 'P4',
      indicator:
        'Business layer session residual / skill / mcp / sync / upgrade / dialog / tool presenter hits must reach `0`',
      current:
        `agentSession=${p4PresenterCounts.agentSessionPresenter}, ` +
        `skill=${p4PresenterCounts.skillPresenter}, ` +
        `mcp=${p4PresenterCounts.mcpPresenter}, ` +
        `sync=${p4PresenterCounts.syncPresenter}, ` +
        `upgrade=${p4PresenterCounts.upgradePresenter}, ` +
        `dialog=${p4PresenterCounts.dialogPresenter}, ` +
        `tool=${p4PresenterCounts.toolPresenter}`,
      status: p4Ready ? 'ready' : 'pending'
    },
    {
      phase: 'P5',
      indicator:
        'Business layer direct legacy access must be `0` (legacy presenter helper / `window.electron` / `window.api`)',
      current:
        `businessLegacy=${metrics['renderer.usePresenter.count']}/` +
        `${metrics['renderer.windowElectron.count']}/` +
        `${metrics['renderer.windowApi.count']}`,
      status: p1Ready ? 'ready' : 'pending'
    }
  ]

  const scoreboardPayload = {
    program: 'main-kernel-refactor',
    generatedOn: new Date().toISOString().slice(0, 10),
    currentPhase: bridgeRegister.currentPhase,
    metrics,
    phaseGates,
    hotPathEdges: hotPathEdges.map((edge) => `${edge.source} -> ${edge.target}`),
    migratedRawChannels: Object.fromEntries(migratedRawChannelCounts)
  }

  await Promise.all([
    Bun.write(
      path.join(REPORT_DIR, 'dependency-report.md'),
      `${renderDependencyReport(scopes)}\n`
    ),
    Bun.write(
      path.join(REPORT_DIR, 'zero-inbound-candidates.md'),
      `${renderZeroInboundReport(scopes)}\n`
    ),
    Bun.write(
      path.join(REPORT_DIR, 'archive-reference-report.md'),
      `${renderArchiveReferenceReport(archiveReferences)}\n`
    ),
    Bun.write(
      path.join(REPORT_DIR, 'main-kernel-boundary-baseline.md'),
      `${renderBoundaryBaselineReport({
        currentPhase: bridgeRegister.currentPhase,
        metrics,
        rendererCounts,
        phaseGates,
        usePresenterSummary,
        windowElectronSummary,
        windowApiSummary,
        rawTimerSummary,
        migratedRawChannelSummary,
        hotPathEdges
      })}\n`
    ),
    Bun.write(
      path.join(REPORT_DIR, 'main-kernel-migration-scoreboard.md'),
      `${renderMigrationScoreboardReport({
        currentPhase: bridgeRegister.currentPhase,
        metrics,
        phaseGates
      })}\n`
    ),
    Bun.write(
      path.join(REPORT_DIR, 'main-kernel-migration-scoreboard.json'),
      `${JSON.stringify(scoreboardPayload, null, 2)}\n`
    ),
    Bun.write(
      path.join(REPORT_DIR, 'main-kernel-bridge-register.md'),
      `${renderBridgeRegisterReport(bridgeRegister, bridgeSummary)}\n`
    )
  ])

  console.log('Architecture baseline reports updated in docs/architecture/baselines.')
}

main().catch((error) => {
  console.error('Failed to generate architecture baseline reports:', error)
  process.exit(1)
})
