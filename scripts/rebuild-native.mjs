import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ELECTRON_VERSION = '42.4.0'

const root = resolve(import.meta.dirname, '..')
const pnpmDir = join(root, 'node_modules', '.pnpm')

const dirs = readdirSync(pnpmDir).filter(
  (d) => d.startsWith('better-sqlite3-multiple-cip_') || d.startsWith('better-sqlite3-multiple-ciphers@')
)

if (dirs.length === 0) {
  console.log('[rebuild-native] better-sqlite3-multiple-ciphers not found, skipping')
  process.exit(0)
}

for (const dir of dirs) {
  const pkgDir = join(pnpmDir, dir, 'node_modules', 'better-sqlite3-multiple-ciphers')
  const binaryPath = join(pkgDir, 'build', 'Release', 'better_sqlite3.node')

  if (existsSync(binaryPath)) {
    console.log(`[rebuild-native] Binary already exists in ${dir}, skipping`)
    continue
  }

  console.log(`[rebuild-native] Rebuilding in ${dir}...`)
  try {
    execSync(`npx @electron/rebuild -f -m . -v ${ELECTRON_VERSION}`, {
      cwd: pkgDir,
      stdio: 'inherit',
      timeout: 180000,
    })
    console.log(`[rebuild-native] Rebuild complete for ${dir}`)
  } catch {
    if (dir.startsWith('better-sqlite3-multiple-cip_')) {
      console.log(`[rebuild-native] Build failed (likely Windows path limit), copying from original...`)
      const origDir = dirs.find((d) => d.startsWith('better-sqlite3-multiple-ciphers@'))
      if (origDir) {
        const origBinary = join(
          pnpmDir,
          origDir,
          'node_modules',
          'better-sqlite3-multiple-ciphers',
          'build',
          'Release',
          'better_sqlite3.node'
        )
        if (existsSync(origBinary)) {
          const destDir = join(pkgDir, 'build', 'Release')
          mkdirSync(destDir, { recursive: true })
          copyFileSync(origBinary, binaryPath)
          console.log(`[rebuild-native] Copied binary from original to patched directory`)
        }
      }
    }
  }
}
