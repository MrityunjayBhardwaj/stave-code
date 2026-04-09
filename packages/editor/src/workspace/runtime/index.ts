/**
 * @stave/editor — workspace/runtime barrel.
 *
 * Phase 10.2 Task 05 surface. Re-exported by `workspace/index.ts` so the
 * single workspace barrel covers everything Tasks 01–08 produce.
 */

export { LiveCodingRuntime, extractBpmFromCode } from './LiveCodingRuntime'
export {
  liveCodingRuntimeRegistry,
  registerRuntimeProvider,
  getRuntimeProviderForExtension,
  getRuntimeProviderForLanguage,
  resetRuntimeRegistryForTests,
} from './registry'
export { STRUDEL_RUNTIME } from './strudelRuntime'
export { SONICPI_RUNTIME } from './sonicpiRuntime'
