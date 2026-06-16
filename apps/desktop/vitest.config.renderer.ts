import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/renderer/**/*.test.ts', 'test/renderer/**/*.test.tsx'],
    setupFiles: ['./test/setup.renderer.ts'],
    alias: {
      '@': resolve('src/renderer/src'),
      '@api': resolve('src/renderer/api'),
      '@shadcn': resolve('src/shadcn'),
      '@shared': resolve('src/shared'),
      '@argos/backend-core/': resolve('../../packages/backend-core/src/'),
      '@argos/shared-contracts/': resolve('../../packages/shared-contracts/src/'),
      '@argos/client-sdk/': resolve('../../packages/client-sdk/src/'),
    },
  },
})
