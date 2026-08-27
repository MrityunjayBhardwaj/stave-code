import type { StrudelEngine } from "@stave/editor";

/**
 * E2E-only handle onto the three audio-bounce paths, so the claims in #1344,
 * #1345 and #1346 have an instrument that can fail rather than only prose.
 *
 * Every figure those issues quote came from a throwaway probe that was deleted
 * once it had been read. A measurement whose instrument is not kept is the
 * shape that rots: nothing can contradict it, so it survives being wrong. The
 * arms in `bounce-paths.spec.ts` exist to go RED the moment the offline
 * renderer starts working — that redness is the notification, not a failure.
 *
 * Guarded twice, matching the other `__stave*` hooks: `NODE_ENV === production`
 * is statically replaced so the body dead-code-eliminates from a real build,
 * and `__STAVE_E2E__` is the runtime gate for dev/test.
 */
export interface BounceOutcome {
  ok: boolean;
  error?: string;
  /** base64 WAV, present only when `ok` */
  wav?: string;
}

export interface BounceProbe {
  /** Verbatim `StrudelEditor.handleExport`: getEngine → init → renderOffline. */
  exportLikeButton(code: string, secs: number): Promise<BounceOutcome>;
  /**
   * init → ONE evaluate → renderOffline. The evaluate is what runs the repl's
   * `injectPatternMethods()`, which is the only thing that puts `setcps` on
   * globalThis — so this path gets one rung further up the ladder than the
   * button does.
   */
  offlineAfterEvaluate(code: string, secs: number): Promise<BounceOutcome>;
  /** init → evaluate → play → record: the live graph, i.e. what you hear. */
  recordLive(code: string, secs: number): Promise<BounceOutcome>;
  /** Which Strudel globals exist right now. Grounds the #1344 diagnosis. */
  globalsCensus(): Record<string, string>;
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(
      ...(bytes.subarray(i, i + CHUNK) as unknown as number[]),
    );
  }
  return btoa(bin);
}

async function attempt(
  run: () => Promise<Blob>,
): Promise<BounceOutcome> {
  try {
    return { ok: true, wav: await toBase64(await run()) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Installs `window.__staveBounceProbe`. Returns a teardown so the caller's
 * effect can remove it, keeping the window surface no dirtier than it found it.
 */
export function installBounceProbe(): () => void {
  if (typeof window === "undefined") return () => {};
  if (process.env.NODE_ENV === "production") return () => {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(window as any).__STAVE_E2E__) return () => {};

  // A probe-owned engine rather than the app's: these arms are about the
  // renderers, and borrowing the app's engine would couple every one of them to
  // which file happens to be open and whether it is playing.
  let engine: StrudelEngine | null = null;
  async function booted(): Promise<StrudelEngine> {
    if (!engine) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import("@stave/editor");
      engine = new mod.StrudelEngine() as StrudelEngine;
    }
    await engine.init();
    return engine;
  }

  const probe: BounceProbe = {
    exportLikeButton: (code, secs) =>
      attempt(async () => {
        const e = await booted();
        return e.renderOffline(code, secs);
      }),

    offlineAfterEvaluate: (code, secs) =>
      attempt(async () => {
        const e = await booted();
        const res = await e.evaluate(code);
        if (res?.error) throw res.error;
        return e.renderOffline(code, secs);
      }),

    recordLive: (code, secs) =>
      attempt(async () => {
        const e = await booted();
        const res = await e.evaluate(code);
        if (res?.error) throw res.error;
        e.play();
        try {
          return await e.record(secs);
        } finally {
          try {
            e.stop();
          } catch {
            /* stop() on an engine that never started is not a failure */
          }
        }
      }),

    globalsCensus: () => {
      const g = globalThis as unknown as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const name of ["setcps", "note", "stack", "s", "sound"]) {
        out[name] = typeof g[name];
      }
      return out;
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__staveBounceProbe = probe;
  return () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__staveBounceProbe;
    try {
      engine?.dispose();
    } catch {
      /* disposing a never-initialised engine is not a failure */
    }
    engine = null;
  };
}
