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

const LEGACY_MAIN_DIRS = [
  path.join(ROOT, 'apps/desktop/src/main/presenter/agentPresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/sessionPresenter')
]

const PRIMARY_MAIN_GUARD_PATHS = [
  path.join(ROOT, 'apps/desktop/src/main/presenter/agentSessionPresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/agentRuntimePresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/skillPresenter'),
  path.join(ROOT, 'apps/desktop/src/main/presenter/syncPresenter/index.ts')
]

const RENDERER_CHAT_GUARD_PATHS = [
  path.join(ROOT, 'packages/ui/src/pages/ChatPage.tsx'),
  path.join(ROOT, 'packages/ui/src/pages/NewThreadPage.tsx'),
  path.join(ROOT, 'packages/ui/src/stores/ui'),
  path.join(ROOT, 'packages/ui/src/components/chat'),
  path.join(ROOT, 'packages/ui/src/components/message'),
  path.join(ROOT, 'packages/ui/src/composables/useArtifacts.ts'),
  path.join(ROOT, 'packages/ui/src/components/sidepanel/WorkspacePanel.tsx')
]

const PROVIDER_LAYER_DIR = path.join(ROOT, 'apps/desktop/src/main/presenter/llmProviderPresenter/providers')
const SKILL_PRESENTER_DIR = path.join(ROOT, 'apps/desktop/src/main/presenter/skillPresenter')

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

function isProtectedPath(filePath, protectedPaths) {
  return protectedPaths.some((entry) => isUnder(filePath, entry))
}

function extractModuleSpecifiers(source) {
  const specifiers = new Set()
  const patterns = [
    /\bimport\s+(?:type\s+)?[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bexport\s+[\s\S]*?\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(source)) !== null) {
      specifiers.add(match[1])
    }
  }

  return specifiers
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

function isLegacyMainImport(filePath, specifier) {
  if (!isProtectedPath(filePath, PRIMARY_MAIN_GUARD_PATHS)) {
    return false
  }

  if (specifier.startsWith('.')) {
    const resolved = path.resolve(path.dirname(filePath), specifier)
    return LEGACY_MAIN_DIRS.some((legacyDir) => isUnder(resolved, legacyDir))
  }

  return (
    specifier === '#/presenter/agentPresenter' ||
    specifier.startsWith('#/presenter/agentPresenter/') ||
    specifier === '#/presenter/sessionPresenter' ||
    specifier.startsWith('#/presenter/sessionPresenter/')
  )
}

function buildViolation(kind, filePath, specifier) {
  return {
    kind,
    file: relativePath(filePath),
    specifier
  }
}

async function findViolations() {
  const scanRoots = [
    path.join(ROOT, 'apps/desktop/src/main/presenter/agentSessionPresenter'),
    path.join(ROOT, 'apps/desktop/src/main/presenter/agentRuntimePresenter'),
    path.join(ROOT, 'apps/desktop/src/main/presenter/skillPresenter'),
    path.join(ROOT, 'apps/desktop/src/main/presenter/syncPresenter/index.ts'),
    path.join(ROOT, 'apps/desktop/src/main/presenter/llmProviderPresenter/providers'),
    path.join(ROOT, 'packages/ui/src/pages/ChatPage.tsx'),
    path.join(ROOT, 'packages/ui/src/pages/NewThreadPage.tsx'),
    path.join(ROOT, 'packages/ui/src/stores/ui'),
    path.join(ROOT, 'packages/ui/src/components/chat'),
    path.join(ROOT, 'packages/ui/src/components/message'),
    path.join(ROOT, 'packages/ui/src/composables/useArtifacts.ts'),
    path.join(ROOT, 'packages/ui/src/components/sidepanel/WorkspacePanel.tsx')
  ]

  const fileSet = new Set()
  for (const entry of scanRoots) {
    try {
      for (const file of await collectFiles(entry)) {
        fileSet.add(file)
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        throw new Error(`Agent cleanup guard scan root is missing: ${relativePath(entry)}`)
      }
      throw error
    }
  }

  const violations = []
  for (const filePath of [...fileSet].sort()) {
    const source = await Bun.file(filePath).text()

    for (const specifier of extractModuleSpecifiers(source)) {
      if (isLegacyMainImport(filePath, specifier)) {
        violations.push(buildViolation('legacy-main-import', filePath, specifier))
      }

      if (
        isProtectedPath(filePath, RENDERER_CHAT_GUARD_PATHS) &&
        (specifier === '@argos/shared/chat' || specifier.startsWith('@argos/shared/chat/'))
      ) {
        violations.push(buildViolation('legacy-chat-import', filePath, specifier))
      }
    }
    if (
      isProtectedPath(filePath, PRIMARY_MAIN_GUARD_PATHS) &&
      source.includes('presenter.sessionPresenter.')
    ) {
      violations.push(buildViolation('legacy-session-access', filePath, 'presenter.sessionPresenter'))
    }

    if (isProtectedPath(filePath, [SKILL_PRESENTER_DIR]) && /\bpresenter\./.test(source)) {
      violations.push(buildViolation('skill-global-presenter', filePath, 'presenter.*'))
    }

    if (
      isProtectedPath(filePath, [SKILL_PRESENTER_DIR]) &&
      (source.includes('getLegacyConversation') || source.includes('updateLegacyConversationSettings'))
    ) {
      violations.push(buildViolation('skill-legacy-fallback', filePath, 'legacy conversation skills'))
    }

    if (isProtectedPath(filePath, [PROVIDER_LAYER_DIR]) && source.includes('presenter.mcpPresenter')) {
      violations.push(buildViolation('provider-global-mcp', filePath, 'presenter.mcpPresenter'))
    }
  }

  return violations
}

async function main() {
  const violations = await findViolations()
  if (violations.length > 0) {
    console.error('Agent cleanup guard failed.')
    for (const violation of violations) {
      console.error(`- [${violation.kind}] ${violation.file} -> ${violation.specifier}`)
    }
    process.exit(1)
  }

  console.log('Agent cleanup guard passed. Baseline violations tracked: 0.')
}

main().catch((error) => {
  console.error('Agent cleanup guard failed to run:', error)
  process.exit(1)
})
