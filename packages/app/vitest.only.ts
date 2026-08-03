/**
 * vitest.only.ts — build a config that runs ONLY the given `include`, inheriting
 * everything else (environment, globals, `server.deps.inline`, aliases) from the
 * app's base `vitest.config.ts`.
 *
 * WHY THIS EXISTS (#1147). The repo had six maintainer configs whose whole
 * purpose is to run one spec "WITHOUT widening the CI include globs", and four
 * of them did the opposite. `mergeConfig` UNIONS array options rather than
 * replacing them, so merging an `include` ADDS to the base globs:
 *
 *     mergeConfig(base, defineConfig({ test: { include: ['one-spec.ts'] } }))
 *     → collects 86 files, not 1
 *
 * Nothing was silently skipped, so it never announced itself — the target spec
 * did run. It just ran alongside the entire app suite, at roughly 30x the
 * advertised cost, under a docblock promising the opposite.
 *
 * TWO THINGS ARE EASY TO GET WRONG HERE, and both are why this is a function
 * rather than a comment repeated six times:
 *
 *  1. `include` must be ASSIGNED, never merged. `vitest.sweep.config.ts` already
 *     knew this and said so; the knowledge simply never travelled back to the
 *     four older configs. A shared helper is how it travels.
 *
 *  2. The assignment must not touch `base`. Verified rather than assumed:
 *     `mergeConfig(base, defineConfig({})).test` is the SAME OBJECT as
 *     `base.test`, so an in-place `config.test.include = [...]` mutates the
 *     imported base module. That is harmless today — each config is loaded in
 *     its own process and nothing else imports base there — but it is a
 *     landmine, so this builds fresh objects at both levels instead.
 */
import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vitest.config'

export function only(include: string[]) {
  const merged = mergeConfig(base, defineConfig({}))
  return { ...merged, test: { ...merged.test, include } }
}
