/**
 * e2e-target — the ONE place the browser suite's target is decided.
 *
 * Both `playwright.config.ts` (which sets `use.baseURL` and the `webServer`
 * port) and `global-setup.ts` (which checks WHOSE server is there) need this.
 * Two copies of the same default is the same hazard as two knobs: change one and
 * the guard vets one URL while the specs visit another, so the check passes and
 * the run is still pointed somewhere nobody meant. That is the exact shape of
 * the bug the guard exists to catch (#1155), so it gets one definition.
 */

export const E2E_PORT = Number(process.env.STAVE_E2E_PORT ?? 3000)
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`
