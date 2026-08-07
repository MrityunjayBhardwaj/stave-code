/**
 * Fixture config for the scope-reporter's tests (#1183) — NOT a gate.
 *
 * This directory is deliberately `src/__fixtures__/`, which is the one place both
 * collectors miss: the app's vitest `include` requires a `__tests__` segment, and
 * playwright's `testDir` is `./tests`. A fixture that IS collected would be run as
 * part of the app gate and inflate the very counts the reporter reports on.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['suite/**/*.test.ts'] } })
