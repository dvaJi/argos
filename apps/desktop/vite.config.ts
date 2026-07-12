import path from 'node:path'
import fs from 'node:fs'
import { resolve } from 'path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { electronSimple } from 'vite-plugin-electron/multi-env'
import { createPathAliasPlugin } from './vite-plugins/path-alias'

/**
 * Minimal `?asset` import handler — replaces electron-vite built-in.
 */
function electronAssetPlugin(projectRoot: string): Plugin {
  const publicDir = path.join(projectRoot, 'resources')
  return {
    name: 'argos:electron-asset',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!source.endsWith('?asset')) return null
      const cleanId = source.slice(0, -'?asset'.length)
      const fromDir = importer ? path.dirname(importer) : projectRoot
      const resolved = path.isAbsolute(cleanId) ? cleanId : path.resolve(fromDir, cleanId)
      return `\0argos-asset:${resolved}`
    },
    load(id) {
      if (!id.startsWith('\0argos-asset:')) return null
      const filePath = id.slice('\0argos-asset:'.length)
      const inPublicDir = filePath.startsWith(publicDir + path.sep) || filePath === publicDir
      if (inPublicDir) {
        const relPath = path.relative(projectRoot, filePath).split(path.sep).join('/')
        return `import { join } from 'node:path'\nimport { app } from 'electron'\nexport default join(app.getAppPath(), ${JSON.stringify(relPath)})\n`
      }
      const fileBaseName = path.basename(filePath)
      this.emitFile({ type: 'asset', fileName: fileBaseName, source: fs.readFileSync(filePath) })
      return `import { join } from 'node:path'\nimport { app } from 'electron'\nexport default join(app.getAppPath(), ${JSON.stringify(fileBaseName)})\n`
    },
  }
}

/**
 * Desktop is now an Electron *shell* only.
 *
 * The React UI lives in the standalone `@argos/ui` package, which builds
 * its own static assets. The daemon serves those assets over HTTP, and the
 * desktop windows load them from `http://127.0.0.1:<daemonPort>/`.
 *
 * This config therefore only builds the Electron main process and preload.
 * All renderer/UI compilation happens in `packages/ui`.
 */
export default defineConfig(({ mode }) => {
  const projectRoot = resolve('.')
  const isDev = mode !== 'production'

  function computeExternalDeps(): string[] {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
    const all = isDev
      ? {
          ...pkg.dependencies,
          ...pkg.devDependencies,
          ...pkg.peerDependencies,
          ...pkg.optionalDependencies,
        }
      : { ...pkg.dependencies }
    return Object.keys(all).filter((d) => !d.startsWith('@argos/'))
  }

  const externalDeps = computeExternalDeps()

  const pathAliasOpts = {
    projectRoot,
    mainDir: path.join(projectRoot, 'src', 'main'),
    sharedPkgDir: path.join(projectRoot, '..', '..', 'packages', 'shared', 'src'),
    contractsPkgDir: path.join(projectRoot, '..', '..', 'packages', 'shared-contracts', 'src'),
  }
  const pathAlias = () => createPathAliasPlugin(pathAliasOpts)

  const env = loadEnv(mode, process.cwd(), '')
  const processEnvDefines = Object.fromEntries(
    Object.entries(env)
      .filter(([k]) => k.startsWith('VITE_'))
      .map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)]),
  )

  return {
    plugins: [
      electronSimple({
        main: {
          input: {
            index: resolve('src/main/index.ts'),
            backgroundExecUtilityHost: resolve('src/main/backgroundExecUtilityHostEntry.ts'),
          },
          plugins: [pathAlias(), electronAssetPlugin(projectRoot)] as any,
          bundleDeps: { both: { exclude: externalDeps } },
          onstart({ startup }) {
            void startup(['.'], { cwd: projectRoot })
          },
          options: {
            define: processEnvDefines,
            build: {
              outDir: resolve('out/main'),
              emptyOutDir: true,
              rollupOptions: {
                external: ['sharp', '@duckdb/node-api'],
                output: {
                  entryFileNames: '[name].js',
                  chunkFileNames: 'chunks/[name]-[hash].js',
                },
              },
            },
          } as any,
        },
        preload: {
          input: {
            index: resolve('src/preload/index.ts'),
            splash: resolve('src/preload/splash-preload.ts'),
            floating: resolve('src/preload/floating-preload.ts'),
            browserOverlay: resolve('src/preload/browser-overlay-preload.ts'),
            pluginSettings: resolve('src/preload/plugin-settings-preload.ts'),
          },
          plugins: [pathAlias()] as any,
          bundleDeps: { both: { exclude: externalDeps.filter((d) => d !== '@electron-toolkit/preload') } },
          options: {
            build: {
              outDir: resolve('out/preload'),
              rollupOptions: {
                external: externalDeps.filter((d) => d !== '@electron-toolkit/preload'),
                output: {
                  format: 'es',
                  codeSplitting: true,
                  inlineDynamicImports: false,
                  entryFileNames: '[name].mjs',
                  chunkFileNames: 'chunks/[name]-[hash].js',
                  assetFileNames: '[name].[ext]',
                },
              },
            },
          } as any,
        },
      }),
    ],
  }
})
