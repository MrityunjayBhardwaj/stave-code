#!/usr/bin/env node
/**
 * run-browser-population.mjs — the ONE supported way to run a browser population.
 *
 * WHY THIS EXISTS. Running the browser suite by hand has two failure modes that
 * both produce confident, wrong numbers — they read as catastrophic code
 * regressions rather than harness problems, and each costs a full run to
 * rediscover because the summary line cannot tell them apart from a real one.
 *
 *   1. TWO PLAYWRIGHT INVOCATIONS IN ONE SCRIPT. `reuseExistingServer` is on,
 *      which is the right call. But a second invocation started while the
 *      first's dev server is being torn down adopts a server that is about to
 *      exit. `globalSetup` checks WHOSE server answers, which is an identity
 *      check and not a liveness one, so it passes — and the run then collapses
 *      with connection-refused errors that look like the app failing to render.
 *
 *   2. A COLD DEV SERVER. Playwright starts the first spec the moment the port
 *      answers, but the framework compiles routes and client chunks on first
 *      request. The earliest spec files race that compile and blow their polls,
 *      while every file after them passes — so the failures cluster at the
 *      alphabetical head of the run and look like whatever those files happen
 *      to be about.
 *
 * Fixing (1) creates (2): the stray warm-up invocation people add to fix the
 * first problem is what was accidentally preventing the second. That is why
 * this is one script rather than a recipe, and why it does all three steps —
 * assert the port, boot one server, warm it — instead of any subset.
 *
 * ⚠ EVERY STEP PRINTS ITS OWN COMPLETION, ON PURPOSE. An intervention that
 * silently did not happen reads exactly like one that worked: a warm-up that
 * died on a bad import still leaves a green run, and gets recorded as "the
 * warm-up fixed it". Read the step lines below before reading the result.
 *
 *   node scripts/run-browser-population.mjs [playwright args...]
 *
 * With no arguments it runs the whole chromium project. Any arguments are
 * passed through verbatim, so a narrowed run is spelled the usual way:
 *
 *   node scripts/run-browser-population.mjs tests/sequencer.spec.ts
 *   node scripts/run-browser-population.mjs --grep "paged window"
 */
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

/** How long to wait for the server to answer at all, and to answer twice warm. */
const BOOT_TIMEOUT_MS = 90_000
const WARM_POLL_MS = 500

function step(msg) {
  console.log(`[population] ${msg}`)
}

function fail(msg) {
  console.error(`\n[population] REFUSING TO RUN: ${msg}\n`)
  process.exit(2)
}

/**
 * The port, read from the SAME module the config and the guard read.
 *
 * Not defaulted here. A second copy of the default is precisely the hazard
 * `e2e-target.ts` exists to prevent — one copy drifts, the guard then vets one
 * URL while the specs visit another, and the check passes while the run is
 * pointed somewhere nobody meant. So the default is parsed out of that file,
 * and a parse failure is fatal rather than silently falling back to a guess.
 */
function resolvePort() {
  if (process.env.STAVE_E2E_PORT) {
    return { port: Number(process.env.STAVE_E2E_PORT), from: 'STAVE_E2E_PORT' }
  }
  const src = readFileSync(join(APP_DIR, 'tests/e2e-target.ts'), 'utf8')
  const match = src.match(/STAVE_E2E_PORT\s*\?\?\s*(\d+)/)
  if (!match) {
    fail(
      'could not read the default port out of tests/e2e-target.ts. That file is the ' +
        'single definition; rather than guess a port and run somewhere nobody meant, ' +
        'set STAVE_E2E_PORT explicitly.',
    )
  }
  return { port: Number(match[1]), from: 'tests/e2e-target.ts' }
}

/**
 * Is anything listening on this port?
 *
 * ⚠ DELIBERATELY ASKS THE PORT, NOT THE PROCESS TABLE. A check that greps for
 * a command name can match the very harness doing the checking — a precondition
 * counter written that way once matched its own launching command and deadlocked
 * for forty minutes. `lsof` on a port number cannot see this script, so the
 * question it answers is the one that matters: is the port occupied?
 */
function listenersOn(port) {
  const res = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
  if (res.error) {
    fail(`could not run lsof to check port ${port}: ${res.error.message}`)
  }
  return res.stdout
    .split('\n')
    .slice(1)
    .filter((l) => l.trim().length > 0)
}

async function probe(url) {
  const startedAt = Date.now()
  try {
    const res = await fetch(url, { redirect: 'manual' })
    return { ok: res.status >= 200 && res.status < 400, status: res.status, ms: Date.now() - startedAt }
  } catch {
    return { ok: false, status: 0, ms: Date.now() - startedAt }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const passThrough = process.argv.slice(2)
  const { port, from } = resolvePort()
  const baseURL = `http://localhost:${port}`

  step(`target ${baseURL} (port from ${from})`)

  // ── 1. The port must be FREE. Never inferred from a previous run's exit code:
  //       a dev server that outlived its runner answers happily and is about to die.
  const existing = listenersOn(port)
  if (existing.length > 0) {
    fail(
      `port ${port} is already in use by ${existing.length} listener(s):\n` +
        existing.map((l) => `      ${l}`).join('\n') +
        `\n\n    A population run must own its server. Stop that process, or point this ` +
        `run elsewhere with STAVE_E2E_PORT.`,
    )
  }
  step(`port ${port} is free (0 listeners)`)

  // ── 2. ONE dev server, booted from the app package.
  //       NOT the root dev task: that fans out to every package and starts a
  //       declaration-file watcher that can rewrite the editor bundle mid-run,
  //       which means the suite would not be reading one fixed artifact.
  step('booting one dev server (app package only)…')
  const server = spawn('pnpm', ['dev'], {
    cwd: APP_DIR,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let serverLog = ''
  server.stdout.on('data', (d) => (serverLog += d.toString()))
  server.stderr.on('data', (d) => (serverLog += d.toString()))

  let stopped = false
  const stopServer = () => {
    if (stopped) return
    stopped = true
    try {
      // Negative pid: the whole group. `next dev` spawns children, and killing
      // only the parent leaves the port held — which would make the NEXT run
      // fail its own port assertion above, with a confusing message.
      process.kill(-server.pid, 'SIGTERM')
    } catch {
      /* already gone */
    }
  }
  process.on('exit', stopServer)
  process.on('SIGINT', () => {
    stopServer()
    process.exit(130)
  })

  // ── 3. WARM it. Two successful responses, not one: the first request is what
  //       triggers the compile, so a single 200 proves the server is up and
  //       proves nothing about it being ready.
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  let first = null
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      fail(`the dev server exited (code ${server.exitCode}) before answering. Log:\n${serverLog.slice(-2000)}`)
    }
    const r = await probe(baseURL)
    if (r.ok) {
      first = r
      break
    }
    await sleep(WARM_POLL_MS)
  }
  if (!first) {
    stopServer()
    fail(`the dev server never answered on ${baseURL} within ${BOOT_TIMEOUT_MS}ms. Log:\n${serverLog.slice(-2000)}`)
  }
  const second = await probe(baseURL)
  if (!second.ok) {
    stopServer()
    fail(`the server answered once (${first.status}) and then not again (${second.status}) — it is not healthy.`)
  }
  step(`warm: ${first.status} in ${first.ms}ms, then ${second.status} in ${second.ms}ms`)
  if (second.ms > first.ms) {
    step(
      `note: the second request was not faster than the first, which is unusual for a ` +
        `compile-on-first-request server. The run continues; treat head-of-run failures with suspicion.`,
    )
  }

  // ── 4. ONE invocation against that server.
  const args = ['playwright', 'test', ...passThrough]
  if (!passThrough.some((a) => a.startsWith('--project'))) args.push('--project=chromium')
  if (!passThrough.some((a) => a.startsWith('--reporter'))) {
    args.push('--reporter=list,./tests/gate-population-reporter.ts')
  }
  step(`running ONE invocation: npx ${args.join(' ')}`)

  const run = spawn('npx', args, {
    cwd: APP_DIR,
    env: { ...process.env, STAVE_E2E_PORT: String(port) },
    stdio: 'inherit',
  })
  const code = await new Promise((resolve) => run.on('close', resolve))

  stopServer()
  step(`done — playwright exited ${code}`)
  process.exit(code ?? 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
