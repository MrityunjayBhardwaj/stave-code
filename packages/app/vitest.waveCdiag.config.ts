import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config'

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ['tests/parity-corpus/_waveC-diagnose.spec.ts'],
    },
  }),
)
