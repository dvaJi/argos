import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import monacoEditorPlugin from 'vite-plugin-monaco-editor-esm'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@': resolve('src/main/'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      externalizeDeps: {
        exclude: ['mermaid']
      },
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          backgroundExecUtilityHost: resolve('src/main/backgroundExecUtilityHostEntry.ts')
        },
        external: ['sharp', '@duckdb/node-api'],
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          manualChunks: undefined
        }
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          splash: resolve('src/preload/splash-preload.ts'),
          floating: resolve('src/preload/floating-preload.ts'),
          browserOverlay: resolve('src/preload/browser-overlay-preload.ts'),
          pluginSettings: resolve('src/preload/plugin-settings-preload.ts')
        }
      }
    }
  },
  renderer: {
    optimizeDeps: {
      exclude: ['stream-monaco'],
      include: [
        '@antv/infographic',
        'monaco-editor',
        'axios'
      ]
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@api': resolve('src/renderer/api'),
        '@shared': resolve('src/shared'),
        "@shadcn": resolve('src/shadcn')
      }
    },
    server: {
      host: '0.0.0.0'
    },
    plugins: [
      tailwindcss(),
      monacoEditorPlugin({
        languageWorkers: [],
        customWorkers: [
          {
            label: 'editorWorkerService',
            entry: 'monaco-editor/esm/vs/editor/editor.worker.js',
          },
          {
            label: 'typescript',
            entry: 'monaco-editor/esm/vs/language/typescript/ts.worker.js',
          },
          {
            label: 'css',
            entry: 'monaco-editor/esm/vs/language/css/css.worker.js',
          },
          {
            label: 'html',
            entry: 'monaco-editor/esm/vs/language/html/html.worker.js',
          },
          {
            label: 'json',
            entry: 'monaco-editor/esm/vs/language/json/json.worker.js',
          },
        ],
        customDistPath(_root, buildOutDir, _base) {
          return path.resolve(buildOutDir, 'monacoeditorwork')
        },
      }),
      react()
    ],
    worker: {
      format: 'es'
    },
    build: {
      minify: 'esbuild',
      cssCodeSplit: false,
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          browserOverlay: resolve('src/renderer/browser-overlay/index.html'),
          floating: resolve('src/renderer/floating/index.html'),
          splash: resolve('src/renderer/splash/index.html'),
          settings: resolve('src/renderer/settings/index.html')
        }
      }
    }
  }
})
