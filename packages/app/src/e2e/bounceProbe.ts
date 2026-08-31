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
   * #1398 spike — does the REAL superdough graph render into an
   * `OfflineAudioContext`, with worklets registered and a SAMPLE audible?
   *
   * `OfflineRenderer` skips every sample and states the reason in its header:
   * "AudioWorklets cannot be re-registered in a fresh OfflineAudioContext."
   * If that is false, the hand-rolled oscillator renderer exists to work around
   * a constraint that was never there.
   *
   * This mirrors `renderPatternAudio` from `@strudel/webaudio` step for step,
   * with TWO DELIBERATE DIVERGENCES, both to keep it a measurement rather than
   * a feature: it does NOT `close()` the live context (the probe shares a page
   * with other arms), and it returns the rendered buffer instead of forcing a
   * browser download. Everything that bears on the QUESTION — the offline
   * context, `setAudioContext`, the controller, `initAudio`, and the real
   * `superdough()` per hap — is the upstream sequence unchanged.
   *
   * ⚠ Reports `nonZero` and not merely `ok`. A silent render is the outcome
   * that matters most and the one an `ok` flag cannot see: both `LiveRecorder`
   * and `OfflineRenderer` already resolve with a valid, full-length WAV of
   * pure silence and no error.
   */
  offlineSuperdough(code: string, secs: number): Promise<OfflineSpikeOutcome>;
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
        // The engine owns this because `@strudel/webaudio` is the editor's
        // dependency, not the app's — and because that is where the shipping
        // path would live if the spike says yes.
        const e = await booted();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { blob, haps } = await (e as any).renderOfflineViaSuperdough(code, secs);
        return { ok: true, workletOk: true, haps, wav: await toBase64(blob) };
      } catch (err) {
        // A throw is the INTERESTING outcome, not a harness problem: it is
        // where "worklets cannot be re-registered" would actually show up.
        return { ok: false, workletOk: false, error: String(err) };
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
