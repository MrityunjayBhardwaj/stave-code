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
  /**
   * #1356 — init -> evaluate -> play -> settle -> STOP -> record, with NO
   * playback restart. The take therefore contains only what the graph is still
   * sounding after the transport reads stopped, which is the decay curve of the
   * lookahead tail. Measuring it is what decides whether the tail is long
   * enough to contaminate a bounce started right after a stop.
   */
  recordAfterStop(code: string, secs: number): Promise<BounceOutcome>;
  /** Which Strudel globals exist right now. Grounds the #1344 diagnosis. */
  globalsCensus(): Record<string, string>;
  /**
   * #1398 — does the REAL superdough graph render into an `OfflineAudioContext`,
   * with worklets registered and a SAMPLE audible?
   *
   * The spike that answered yes is now the shipped path: this drives
   * `renderOfflineReport`, the same render `renderOffline` returns (#1353).
   *
   * ⚠ Reports the WAV and not merely `ok`. A silent render is the outcome that
   * matters most and the one an `ok` flag cannot see.
   */
  offlineSuperdough(code: string, secs: number): Promise<OfflineSpikeOutcome>;
  /**
   * #1353 — `renderOfflineReport`, with what it could not play and the
   * warnings the engine emitted while rendering. The warnings are the channel a
   * user sees (the StatusBar and Console read the same log), so an arm can pin
   * that a skip is SAID, not only counted.
   */
  offlineReport(code: string, secs: number): Promise<OfflineReportOutcome>;
}

/** #1353 — what `renderOfflineReport` said about one render. */
export interface OfflineReportOutcome {
  ok: boolean;
  error?: string;
  haps?: number;
  played?: number;
  skipped?: Array<{ reason: string; count: number }>;
  /** Warning messages the engine emitted during the call, success or not. */
  warnings: string[];
  /** base64 WAV, present only when `ok`. */
  wav?: string;
}

/** #1398 — what the offline-superdough spike measured. */
export interface OfflineSpikeOutcome {
  ok: boolean;
  error?: string;
  /** Did the offline render get past `initAudio()`? The whole claim. */
  workletOk?: boolean;
  /** Onset haps the pattern produced, so a silent render can be told from an empty one. */
  haps?: number;
  /** base64 WAV, present only when `ok` — measured by the spec's own reader. */
  wav?: string;
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

    recordAfterStop: (code, secs) =>
      attempt(async () => {
        const e = await booted();
        const res = await e.evaluate(code);
        if (res?.error) throw res.error;
        e.play();
        // Let playback genuinely establish before stopping, so the tail we
        // measure is a real take's ring-out and not a graph that never sounded.
        await new Promise((r) => setTimeout(r, 2000));
        e.stop();
        return e.record(secs);
      }),

    offlineSuperdough: async (code, secs) => {
      try {
        const e = await booted();
        const { blob, haps } = await e.renderOfflineReport(code, secs);
        return { ok: true, workletOk: true, haps, wav: await toBase64(blob) };
      } catch (err) {
        // A throw is the INTERESTING outcome, not a harness problem: it is
        // where "worklets cannot be re-registered" would actually show up.
        return { ok: false, workletOk: false, error: String(err) };
      }
    },

    offlineReport: async (code, secs) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import("@stave/editor");
      const warnings: string[] = [];
      // Subscribed for the call, not diffed from history: `emitLog` folds a
      // repeat of an existing entry into that entry's count instead of adding a
      // row, so a history-length diff would miss a warning seen before.
      const unsubscribe = mod.subscribeLog((entry: { level: string; message: string }) => {
        if (entry.level === "warn") warnings.push(entry.message);
      });
      try {
        const e = await booted();
        const { blob, haps, played, skipped } = await e.renderOfflineReport(code, secs);
        const wav = await toBase64(blob);
        // listeners fire in a microtask after emit
        await Promise.resolve();
        return { ok: true, haps, played, skipped, warnings, wav };
      } catch (err) {
        await Promise.resolve();
        return { ok: false, error: String(err), warnings };
      } finally {
        unsubscribe();
      }
    },

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
