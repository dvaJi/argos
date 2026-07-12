import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/renderer/**/*.test.ts', 'test/renderer/**/*.test.tsx'],
    setupFiles: ['./test/setup.renderer.ts'],
    alias: {
      '#': resolve('../../packages/ui/src'),
      '#api': resolve('../../packages/ui/api'),
      '#shadcn': resolve('../../packages/ui/shadcn'),
      '#settings': resolve('../../packages/ui/settings'),
      '#splash': resolve('../../packages/ui/splash'),
      '@argos/shared-contracts': resolve('../../packages/shared-contracts/src'),
      '@argos/shared': resolve('../../packages/shared/src'),
      '@argos/backend-core/': resolve('../../packages/backend-core/src/'),
      '@argos/shared-contracts/': resolve('../../packages/shared-contracts/src/'),
      '@argos/client-sdk/': resolve('../../packages/client-sdk/src/'),
    },
  },
})
