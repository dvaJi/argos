import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

// Route contracts were consolidated to a single source of truth in
// @argos/shared-contracts (see docs/architecture/consolidate-contract-catalogs).
// With one catalog, cross-catalog drift is no longer possible; this guard now
// verifies catalog integrity: every route registered in ARGOS_ROUTE_CATALOG
// must be imported in the same file (catches registration-without-import and
// orphaned entries after a route is removed).
const CATALOG_FILE = path.join(ROOT, 'packages/shared-contracts/src/routes.ts')

const ENTRY_RE = /\[(\w+Route)\.name\]\s*:/g
const IMPORT_BLOCK_RE = /import\s*\{([^}]*)\}\s*from/g

function extractEntries(source) {
  const ids = new Set()
  let m
  ENTRY_RE.lastIndex = 0
  while ((m = ENTRY_RE.exec(source)) !== null) {
    ids.add(m[1])
  }
  return ids
}

function extractImported(source) {
  const ids = new Set()
  let block
  IMPORT_BLOCK_RE.lastIndex = 0
  while ((block = IMPORT_BLOCK_RE.exec(source)) !== null) {
    const inner = block[1]
    const idRe = /\b(\w+Route)\b/g
    let m
    while ((m = idRe.exec(inner)) !== null) {
      ids.add(m[1])
    }
  }
  return ids
}

async function main() {
  let source
  try {
    source = await Bun.file(CATALOG_FILE).text()
  } catch (error) {
    console.error(`[route-catalog-drift-guard] Could not read ${CATALOG_FILE}: ${error.message}`)
    process.exit(1)
  }

  const entries = extractEntries(source)
  const imported = extractImported(source)

  const unimported = [...entries].filter((id) => !imported.has(id))
  if (unimported.length > 0) {
    console.error(
      `[route-catalog-drift-guard] Registered routes missing an import in routes.ts: ${[...unimported].sort().join(', ')}`,
    )
    process.exit(1)
  }

  console.log(`[route-catalog-drift-guard] OK: ${entries.size} route entries registered and imported (single source of truth).`)
}

main()
