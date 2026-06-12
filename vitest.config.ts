import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['test/renderer/**/*.{test,spec}.{js,ts}'],
          setupFiles: ['./test/setup.ts'],
          globals: true
        },
        resolve: {
          alias: [
            { find: '@/', replacement: resolve('src/renderer/src/') + '/' },
            { find: '@api', replacement: resolve('src/renderer/api') },
            { find: '@browser', replacement: resolve('src/renderer/browser/') },
            { find: '@shared', replacement: resolve('src/shared') },
            { find: '@shadcn', replacement: resolve('src/shadcn') },
            { find: 'electron', replacement: resolve('test/mocks/electron.ts') },
            { find: '@electron-toolkit/utils', replacement: resolve('test/mocks/electron-toolkit-utils.ts') }
          ]
        }
      },
      {
        plugins: [react()],
        test: {
          name: 'main',
          environment: 'node',
          include: ['test/main/**/*.{test,spec}.{js,ts}'],
          setupFiles: ['./test/setup.ts'],
          globals: true
        },
        resolve: {
          alias: [
            { find: '@/', replacement: resolve('src/main/') + '/' },
            { find: '@shared', replacement: resolve('src/shared') },
            { find: '@argos/backend-core', replacement: resolve('packages/backend-core/src') },
            { find: '@argos/backend-core/', replacement: resolve('packages/backend-core/src/') },
            { find: '@argos/shared-contracts', replacement: resolve('packages/shared-contracts/src') },
            { find: '@argos/shared-contracts/', replacement: resolve('packages/shared-contracts/src/') },
            { find: 'electron', replacement: resolve('test/mocks/electron.ts') },
            { find: '@electron-toolkit/utils', replacement: resolve('test/mocks/electron-toolkit-utils.ts') }
          ]
        }
      }
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'out/**',
        'test/**',
        '**/*.d.ts',
        'scripts/**',
        'build/**',
        '.vscode/**',
        '.git/**'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000
  }
})
