import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve('src/renderer/src'),
      '@api': resolve('src/renderer/api'),
      '@browser': resolve('src/renderer/browser'),
      '@shadcn': resolve('src/shadcn'),
      '@shared': resolve('src/shared')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage/renderer',
      include: ['src/renderer/**'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'out/**',
        'test/**',
        '**/*.d.ts',
        'scripts/**',
        'build/**',
        '.vscode/**',
        '.git/**',
        '**/*.stories.{js,ts}',
        '**/*.config.{js,ts}'
      ]
    },
    include: ['test/renderer/**/*.{test,spec}.{js,ts}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'out/**'
    ],
    testTimeout: 10000,
    hookTimeout: 10000,
    setupFiles: ['./test/setup.renderer.ts']
  }
})
