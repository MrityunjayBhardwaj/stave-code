/**
 * vitest.waveCdiag.config.ts — the Wave C diagnose probe, run by explicit
 * `--config`. See `vitest.only.ts`: until #1147 this merged its `include`
 * and so collected 86 files rather than 1.
 */
import { only } from './vitest.only'

export default only(['tests/parity-corpus/_waveC-diagnose.spec.ts'])
