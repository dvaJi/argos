import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// DuckDB is intentionally a desktop dependency. Resolve it from the desktop
// package so this root-level smoke command works in Bun workspace installs on
// every CI architecture.
const require = createRequire(new URL('../apps/desktop/package.json', import.meta.url))
const duckdbPackage = require('@duckdb/node-api/package.json')

async function main() {
  console.log(`[DuckDB Smoke] package version: ${duckdbPackage.version}`)

  const duckdb = await import(pathToFileURL(require.resolve('@duckdb/node-api')).href)
  const instance = await duckdb.DuckDBInstance.create(':memory:')
  const connection = await instance.connect()

  try {
    console.log('[DuckDB Smoke] created in-memory instance')
    await connection.run('INSTALL vss')
    console.log('[DuckDB Smoke] installed vss')
    await connection.run('LOAD vss')
    console.log('[DuckDB Smoke] loaded vss')
  } finally {
    connection.closeSync()
    instance.closeSync()
  }
}

main().catch((error) => {
  console.error('[DuckDB Smoke] failed:', error)
  process.exit(1)
})
