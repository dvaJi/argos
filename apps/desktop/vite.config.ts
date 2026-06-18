import path from 'node:path'
import fs from 'node:fs'
import { resolve } from 'path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'
import tailwindcss from '@tailwindcss/vite'
import { electronSimple } from 'vite-plugin-electron/multi-env'

/**
 * Path-aware alias resolver for multi-environment setups.
 *
 * Root resolve.alias maps `@` to src/renderer/src, but main-process files use
 * `@/` to reference src/main. This plugin rewrites alias imports based on the
 * importer location and returns the forward-slash normalized absolute path so
 * that Rolldown deduplicates it with relative imports of the same file.
 */
function pathAliasPlugin(projectRoot: string): Plugin {
  const mainDir = path.join(projectRoot, 'src', 'main')
  const rendererSrcDir = path.join(projectRoot, 'src', 'renderer', 'src')
  const sharedDir = path.join(projectRoot, 'src', 'shared')
  const apiDir = path.join(projectRoot, 'src', 'renderer', 'api')
  const shadcnDir = path.join(projectRoot, 'src', 'shadcn')
  const settingsDir = path.join(projectRoot, 'src', 'renderer', 'settings')

  const toFwd = (p: string) => p.split(path.sep).join('/')

  return {
    name: 'argos:path-alias',
    enforce: 'pre',
    async resolveId(source, importer, resolveOpts) {
      let aliasedPath: string | null = null

      if (source.startsWith('@/')) {
        const importerNorm = importer ? toFwd(importer) : ''
        const isMain = importerNorm.startsWith(toFwd(mainDir) + '/')
        const base = isMain ? mainDir : rendererSrcDir
        aliasedPath = path.resolve(base, source.slice(2))
      } else if (source.startsWith('@shared/')) {
        aliasedPath = path.resolve(sharedDir, source.slice(8))
      } else if (source.startsWith('@api/')) {
        aliasedPath = path.resolve(apiDir, source.slice(5))
      } else if (source.startsWith('@shadcn/')) {
        aliasedPath = path.resolve(shadcnDir, source.slice(8))
      } else if (source.startsWith('@settings/')) {
        aliasedPath = path.resolve(settingsDir, source.slice(10))
      }

      if (!aliasedPath) return null

      // Delegate to Vite's built-in resolver for extension/dir resolution,
      // then normalize to forward slashes so the module ID matches what
      // relative imports produce (preventing Rolldown duplication on Windows).
      const resolved = await this.resolve(toFwd(aliasedPath), importer, {
        ...resolveOpts,
        skipSelf: true,
      })
      if (resolved && typeof resolved.id === 'string') {
        return { ...resolved, id: toFwd(resolved.id) }
      }
      return resolved
    },
  }
}

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

  const env = loadEnv(mode, process.cwd(), '')
  const processEnvDefines = Object.fromEntries(
    Object.entries(env)
      .filter(([k]) => k.startsWith('VITE_'))
      .map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)])
  )

  return {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        '@api': resolve('src/renderer/api'),
        '@shared': resolve('src/shared'),
        '@shadcn': resolve('src/shadcn'),
        '@settings': resolve('src/renderer/settings'),
      },
    },
    optimizeDeps: {
      exclude: ['stream-monaco'],
      include: ['@antv/infographic', 'monaco-editor', 'axios'],
    },
    server: {
      host: '0.0.0.0',
    },
    worker: {
      format: 'es',
    },
    build: {
      outDir: resolve('out/renderer'),
      emptyOutDir: true,
      minify: 'esbuild',
      cssCodeSplit: false,
      rolldownOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          browserOverlay: resolve('src/renderer/browser-overlay/index.html'),
          floating: resolve('src/renderer/floating/index.html'),
          splash: resolve('src/renderer/splash/index.html'),
        },
      },
    },
    plugins: [
      pathAliasPlugin(projectRoot),
      electronAssetPlugin(projectRoot),
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
      }),
      tailwindcss(),
      monacoEditorPlugin({
        languageWorkers: [],
        customWorkers: [
          { label: 'editorWorkerService', entry: 'monaco-editor/esm/vs/editor/editor.worker.js' },
          { label: 'typescript', entry: 'monaco-editor/esm/vs/language/typescript/ts.worker.js' },
          { label: 'css', entry: 'monaco-editor/esm/vs/language/css/css.worker.js' },
          { label: 'html', entry: 'monaco-editor/esm/vs/language/html/html.worker.js' },
          { label: 'json', entry: 'monaco-editor/esm/vs/language/json/json.worker.js' },
        ],
        customDistPath(_root, buildOutDir, _base) {
          return path.resolve(buildOutDir, 'monacoeditorwork')
        },
      }),
      react(),
      electronSimple({
        main: {
          input: {
            index: resolve('src/main/index.ts'),
            backgroundExecUtilityHost: resolve('src/main/backgroundExecUtilityHostEntry.ts'),
          },
          notBundle: externalDeps,
          onstart({ startup }) {
            void startup(['.'], { cwd: projectRoot })
          },
          options: {
            plugins: [pathAliasPlugin(projectRoot), electronAssetPlugin(projectRoot)] as any,
            define: processEnvDefines,
            build: {
              outDir: resolve('out/main'),
              emptyOutDir: true,
              rolldownOptions: {
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
          notBundle: externalDeps.filter((d) => d !== '@electron-toolkit/preload'),
          options: {
            plugins: [pathAliasPlugin(projectRoot)] as any,
            build: {
              outDir: resolve('out/preload'),
              rolldownOptions: {
                external: externalDeps.filter((d) => d !== '@electron-toolkit/preload'),
                output: {
                  format: 'es',
                  codeSplitting: true,
                  inlineDynamicImports: false,
                  entryFileNames: '[name].mjs',
                  chunkFileNames: 'chunks/[name]-[hash].mjs',
                  assetFileNames: '[name].[ext]',
                },
              },
            },
          },
        },
      }),
    ],
  }
})
