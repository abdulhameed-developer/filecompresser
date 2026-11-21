import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    // Keep shared workstations responsive without relaxing test deadlines.
    maxWorkers: 2,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.dirname(fileURLToPath(import.meta.url)),
    },
  },
})
