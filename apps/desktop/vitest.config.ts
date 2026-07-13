import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/main/**/*.test.ts', 'test/main/**/*.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    alias: {
      '#/': resolve('src/main/') + '/',
      '@argos/shared-contracts': resolve('../../packages/shared-contracts/src'),
      '@argos/shared': resolve('../../packages/shared/src'),
      '@argos/backend-core/': resolve('../../packages/backend-core/src/'),
      '@argos/shared-contracts/': resolve('../../packages/shared-contracts/src/'),
      '@argos/client-sdk/': resolve('../../packages/client-sdk/src/'),
      '@argos/agent-runtime': resolve('../../packages/agent-runtime/src'),
    },
    deps: {
      optimizer: {
        ssr: {
          include: ['@anthropic-ai/sdk']
        }
      }
    }
  },
  resolve: {
    alias: {
      '@argos/shared-contracts': resolve('../../packages/shared-contracts/src'),
      '@argos/shared': resolve('../../packages/shared/src'),
    }
  }
})
