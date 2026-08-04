/**
 * global-setup — prove the server under test is OURS before a single spec runs.
 *
 * `webServer.reuseExistingServer` trusts a listening port. A port is not an
 * identity: any project's dev server answering there becomes the system under
 * test, and Playwright reports failures rather than an error, because from its
 * side nothing is wrong — the app simply never rendered what we asked for.
 *
 * Measured (#1155): with an unrelated Next app holding the port,
 * `tests/sequencer.spec.ts` was 15 failed / 0 passed; against Stave on the same
 * commit and command, 15 passed / 0 failed. Every one of those 15 read
 * `waiting for locator('[data-bottom-panel="root"]') to be visible` — which is
 * the SAME signature this suite's config documents as contention. A wrong-app
 * run and a contended run are therefore indistinguishable from the output, and
 * the documented noise budget will absorb a run that exercised none of our code.
 *
 * So the check has to happen before the specs, and it has to be about identity
 * rather than reachability. `data-stave-theme` is server-rendered into the
 * document shell, so a plain fetch settles it without booting a browser.
 *
 * ORDERING, measured rather than assumed: `webServer` is fully up BEFORE this
 * hook runs. Verified by pointing a run at a free port with no server anywhere —
 * Playwright launched its own dev server and this hook then found Stave on it.
 * (An earlier reading said the opposite; that was an artifact of `next dev`
 * refusing to start a second server from the same directory, which left the port
 * empty for reasons that had nothing to do with hook order.)
 *
 * That ordering is what lets this stay simple: by the time we look, the server
 * is either ours (started by `webServer`) or a pre-existing one that
 * `reuseExistingServer` adopted — and telling those apart is the whole job. An
 * unreachable server is therefore a real failure, not a case to wave through.
 */

import { E2E_BASE_URL } from './e2e-target'

const STAVE_MARKER = 'data-stave-theme'

export default async function globalSetup(): Promise<void> {
  // The SAME value the config gives Playwright, imported rather than re-derived,
  // so the URL vetted here is by construction the URL the specs visit.
  const baseURL = E2E_BASE_URL

  let html: string
  try {
    const res = await fetch(baseURL, { redirect: 'follow' })
    html = await res.text()
  } catch (err) {
    throw new Error(
      `[stave e2e] Could not reach ${baseURL} — ${String(err)}\n` +
        `\`webServer\` runs before this check, so by now the dev server should ` +
        `be up. If a stray process holds the port without serving, stop it or ` +
        `use STAVE_E2E_PORT=<free port>.`,
    )
  }

  if (html.includes(STAVE_MARKER)) return

  // Name what IS there, so the message is actionable rather than just a refusal.
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim()
  throw new Error(
    `[stave e2e] ${baseURL} is serving an app that is NOT Stave` +
      (title ? ` — its title is "${title}".` : '.') +
      `\n\nPlaywright reuses whatever already listens on the port, so the whole ` +
      `suite would have run against that app and reported its failures as ours ` +
      `(#1155).\n\nEither stop the other server, or point this run elsewhere:\n` +
      `  STAVE_E2E_PORT=3100 pnpm gate:editing:browser\n`,
  )
}
