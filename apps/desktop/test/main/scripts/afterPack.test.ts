import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loadAfterPack = async () => {
  return (await import('../../../../../scripts/afterPack.js')).default as (context: {
    targets: Array<{ name: string }>
    appOutDir: string
    electronPlatformName: string
  }) => Promise<void>
}

describe('afterPack', () => {
  let tmpDir: string

  beforeEach(async () => {
    vi.resetModules()
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'argos-after-pack-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('keeps non-Linux packages unchanged', async () => {
    const afterPack = await loadAfterPack()
    const launcherPath = path.join(tmpDir, 'Argos')
    await writeFile(launcherPath, 'launcher')

    await afterPack({
      targets: [],
      appOutDir: tmpDir,
      electronPlatformName: 'darwin'
    })

    await expect(stat(launcherPath)).resolves.toBeTruthy()
    await expect(readFile(launcherPath, 'utf8')).resolves.toBe('launcher')
  })

  it('adds the Linux no-sandbox wrapper for AppImage builds', async () => {
    const afterPack = await loadAfterPack()
    const launcherPath = path.join(tmpDir, 'argos')
    await writeFile(launcherPath, '#!/bin/bash\n')

    await afterPack({
      targets: [{ name: 'AppImage' }],
      appOutDir: tmpDir,
      electronPlatformName: 'linux'
    })

    await expect(stat(path.join(tmpDir, 'argos.bin'))).resolves.toBeTruthy()
    await expect(readFile(launcherPath, 'utf8')).resolves.toContain('--no-sandbox')
  })
})
