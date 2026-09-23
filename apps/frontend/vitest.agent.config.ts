import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['server/agent.test.mjs'], environment: 'node' },
})
