import path from 'node:path'
import fs from 'node:fs'
import { resolve } from 'path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react, {reactCompilerPreset} from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import monacoEditorPlugin from '@dvaji/vite-plugin-monaco-editor'
import tailwindcss from '@tailwindcss/vite'
import { electronSimple } from 'vite-plugin-electron/multi-env'
import babel from '@rolldown/plugin-babel';
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
    rendererSrcDir: path.join(projectRoot, 'src', 'renderer', 'src'),
    mainDir: path.join(projectRoot, 'src', 'main'),
    sharedPkgDir: path.join(projectRoot, '..', '..', 'packages', 'shared', 'src'),
    contractsPkgDir: path.join(projectRoot, '..', '..', 'packages', 'shared-contracts', 'src'),
    apiDir: path.join(projectRoot, 'src', 'renderer', 'api'),
    shadcnDir: path.join(projectRoot, 'src', 'shadcn'),
    settingsDir: path.join(projectRoot, 'src', 'renderer', 'settings'),
  }
  const pathAlias = () => createPathAliasPlugin(pathAliasOpts)

  const env = loadEnv(mode, process.cwd(), '')
  const processEnvDefines = Object.fromEntries(
    Object.entries(env)
      .filter(([k]) => k.startsWith('VITE_'))
      .map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)])
  )

  return {
    root: resolve('src/renderer'),
    resolve: {
      alias: [
        { find: '@shared/contracts', replacement: path.resolve(projectRoot, '..', '..', 'packages', 'shared-contracts', 'src') },
        { find: '@shared', replacement: path.resolve(projectRoot, '..', '..', 'packages', 'shared', 'src') },
        { find: '@api', replacement: resolve('src/renderer/api') },
        { find: '@shadcn', replacement: resolve('src/shadcn') },
        { find: '@settings', replacement: resolve('src/renderer/settings') },
      ],
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
      pathAlias(),
      electronAssetPlugin(projectRoot),
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: resolve('src/renderer/src/routes'),
        generatedRouteTree: resolve('src/renderer/src/routeTree.gen.ts'),
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
      babel({
        presets: [reactCompilerPreset()]
      }),
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
          plugins: [pathAlias()] as any,
          bundleDeps: { both: { exclude: externalDeps.filter((d) => d !== '@electron-toolkit/preload') } },
          options: {
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
          } as any,
        },
      }),
    ],
  }
})
