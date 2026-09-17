import type { LiveCodingRuntime, StrudelEngine } from "@stave/editor";

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
  /**
   * #1409 — `renderStems`, one row per stem in the order the result lists them,
   * plus the order progress was reported in. A failed stem says whether it was
   * refused as SILENT and how big the refused take is, read through the error
   * the way a caller would have to.
   */
  stems(stems: Record<string, string>, secs: number): Promise<StemsOutcome>;
  /**
   * #1627 — evaluate `liveCode`, optionally play it, then render `renderCode`
   * offline WHILE the transport is in that state. A live take is recorded
   * across the render when playing, so an arm can see whether the speakers
   * dropped out and whether live notes reached the rendered file. Transport
   * state and cycle position are read straight off the scheduler on both sides
   * of the render: they are the facts the fix has to preserve.
   */
  renderWhilePlaying(
    liveCode: string,
    renderCode: string,
    secs: number,
    playing: boolean,
    /**
     * Press Stop or Play INSIDE the render's borrow window: at the moment it
     * calls `startRendering()`, after every note has been scheduled onto the
     * offline context and before a sample is rendered. A press any later can be
     * clean for the wrong reason: a live note is scheduled at the LIVE clock's
     * time (`webaudio.mjs:109`), and once the render has run past that time the
     * note lands in audio already rendered and is dropped, so an undeferred Play
     * 500ms in leaked nothing.
     */
    midRender?: "stop" | "play",
  ): Promise<RenderWhilePlayingOutcome>;
  /**
   * #1344 — the active-document bounce. Loads `code` as the document of a
   * runtime over the probe's engine, puts the transport in `setup`'s state, then
   * calls `LiveCodingRuntime.bounceOffline`. Reports the frame BEFORE the bounce
   * (so an arm can prove its seek and loop took hold) and what it left behind.
   */
  bounceLoaded(
    code: string,
    secs: number,
    setup?: BounceLoadedSetup,
  ): Promise<BounceLoadedOutcome>;
  /**
   * #1652 — how a LONG render behaves, without shipping the file back. Loads
   * `code` the way a bounce does, renders `secs` at `sampleRate` through
   * `renderLoadedReport`, and reports where the time went, how big the file is,
   * and the level of one second at the start of each tenth — enough to tell a
   * whole file from a truncated or silent one. The WAV itself stays in the page:
   * at an hour it would be larger than the channel back can carry.
   */
  bounceStats(code: string, secs: number, sampleRate: number): Promise<BounceStatsOutcome>;
}

/** #1652 — one long render, measured. */
export interface BounceStatsOutcome {
  ok: boolean;
  error?: string;
  /** Where it failed: loading the document, or the render/encode itself. */
  stage?: "load" | "render";
  sampleRate?: number;
  secs?: number;
  /** Start of the call to `startRendering()` — querying and scheduling the first window. */
  scheduleMs?: number;
  /** Inside `startRendering()`, pauses included. */
  renderMs?: number;
  /** After the render resolved: encoding the WAV. */
  encodeMs?: number;
  bytes?: number;
  /** 16-bit stereo frames in the file. */
  frames?: number;
  /** RMS of one second at the start of each tenth of the file. */
  blockRms?: number[];
}

/** #1344 — the transport state to bounce from. */
export interface BounceLoadedSetup {
  playing?: boolean;
  /** Seek to this song cycle first (the runtime's `seekTo`). */
  seek?: number;
  /** Arm this loop first (the runtime's `setLoopRange`). */
  loop?: { startCycle: number; cycles: number };
}

/** #1344 — what one active-document bounce returned, and the frame around it. */
export interface BounceLoadedOutcome {
  ok: boolean;
  error?: string;
  wav?: string;
  haps?: number;
  played?: number;
  skipped?: Array<{ reason: string; count: number }>;
  /** The engine's tempo after the bounce's evaluate. */
  cps?: number | null;
  offsetBefore?: number;
  loopBefore?: { startCycle: number; cycles: number } | null;
  playingAfter?: boolean;
  offsetAfter?: number;
  loopAfter?: { startCycle: number; cycles: number } | null;
}

/** #1627 — one offline render taken while the transport was in a known state. */
export interface RenderWhilePlayingOutcome {
  ok: boolean;
  error?: string;
  /** base64 WAV of the offline render. */
  renderWav?: string;
  /** base64 WAV of the live output recorded across the render, when playing. */
  liveWav?: string;
  /** When the render started, in ms after the live take started. */
  renderStartMs?: number;
  /** How long the render took, wall clock. */
  renderMs?: number;
  startedBefore?: boolean;
  startedAfter?: boolean;
  /** `scheduler.now()` just before and just after the render, in cycles. */
  cycleBefore?: number;
  cycleAfter?: number;
  cps?: number;
  /** When the render called `startRendering()`, in ms after it was asked for. */
  renderingAtMs?: number;
  /** When `midRender` was pressed, in ms after the render was asked for. */
  pressedAtMs?: number;
}

/** #1409 — what `renderStems` returned, stem by stem. */
export interface StemsOutcome {
  /** False only when `renderStems` itself threw, rather than a stem failing. */
  ok: boolean;
  error?: string;
  progress: Array<[string, number, number]>;
  stems?: Array<{
    key: string;
    ok: boolean;
    error?: string;
    silent?: boolean;
    /** Byte size of `SilentCaptureError.refused`, when the stem was refused as silent. */
    refusedBytes?: number;
    /** base64 WAV, present only when the stem is `ok`. */
    wav?: string;
  }>;
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

  // #1344 — ONE runtime over the probe's engine, reused: `LiveCodingRuntime`'s
  // `dispose()` disposes its engine too, so a runtime per call would tear down
  // the engine every other arm here shares. Its document is `loadedCode`.
  let runtime: LiveCodingRuntime | null = null;
  let loadedCode = "";
  async function runtimeOver(e: StrudelEngine): Promise<LiveCodingRuntime> {
    if (!runtime) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import("@stave/editor");
      runtime = new mod.LiveCodingRuntime("bounce-probe", e, () => loadedCode) as LiveCodingRuntime;
    }
    return runtime;
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

    stems: async (stems, secs) => {
      const progress: Array<[string, number, number]> = [];
      try {
        const e = await booted();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mod: any = await import("@stave/editor");
        const out = await e.renderStems(stems, secs, (s, i, total) => {
          progress.push([s, i, total]);
        });
        const rows: NonNullable<StemsOutcome["stems"]> = [];
        for (const [key, o] of Object.entries(out)) {
          if (o.ok) {
            rows.push({ key, ok: true, wav: await toBase64(o.blob) });
          } else {
            const silent = o.error instanceof mod.SilentCaptureError;
            rows.push({
              key,
              ok: false,
              error: String(o.error),
              silent,
              refusedBytes: silent ? (o.error as { refused: Blob }).refused.size : undefined,
            });
          }
        }
        return { ok: true, progress, stems: rows };
      } catch (err) {
        return { ok: false, error: String(err), progress };
      }
    },

    renderWhilePlaying: async (liveCode, renderCode, secs, playing, midRender) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let e: StrudelEngine | null = null;
      const offlineProto = OfflineAudioContext.prototype;
      const realStartRendering = offlineProto.startRendering;
      try {
        e = await booted();
        const engine = e;
        const res = await e.evaluate(liveCode);
        if (res?.error) throw res.error;
        // The scheduler is private to the engine; the probe reads it only to
        // measure what the render did to the transport.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sched: any = (e as any).repl?.scheduler;
        if (playing) {
          e.play();
          // Let playback establish, so the take has live audio on both sides.
          await sleep(1500);
        }
        // Long enough to cover a fast render with live audio either side of it.
        const liveTake = playing ? e.record(4) : null;
        const takeStart = performance.now();
        await sleep(500);
        const startedBefore = Boolean(sched?.started);
        const cycleBefore = sched?.now?.();
        let renderingAtMs: number | undefined;
        let pressedAtMs: number | undefined;
        const t0 = performance.now();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (offlineProto as any).startRendering = function (this: OfflineAudioContext) {
          renderingAtMs ??= performance.now() - t0;
          if (midRender && pressedAtMs === undefined) {
            pressedAtMs = performance.now() - t0;
            if (midRender === "stop") engine.stop();
            else engine.play();
          }
          return realStartRendering.call(this);
        };
        const rendering = e.renderOfflineReport(renderCode, secs);
        const { blob } = await rendering;
        const t1 = performance.now();
        const startedAfter = Boolean(sched?.started);
        const cycleAfter = sched?.now?.();
        const live = liveTake ? await liveTake : null;
        return {
          ok: true,
          renderWav: await toBase64(blob),
          liveWav: live ? await toBase64(live) : undefined,
          renderStartMs: t0 - takeStart,
          renderMs: t1 - t0,
          startedBefore,
          startedAfter,
          cycleBefore,
          cycleAfter,
          cps: sched?.cps,
          renderingAtMs,
          pressedAtMs,
        };
      } catch (err) {
        return { ok: false, error: String(err) };
      } finally {
        offlineProto.startRendering = realStartRendering;
        try {
          e?.stop();
        } catch {
          /* stop() on an engine that never started is not a failure */
        }
      }
    },

    bounceLoaded: async (code, secs, setup) => {
      try {
        const e = await booted();
        const rt = await runtimeOver(e);
        // The runtime is reused across calls, so each call starts from a clean
        // frame rather than whatever the previous arm left armed.
        rt.stop();
        e.setTransportOffset(0);
        e.setLoopRange(null);
        loadedCode = code;
        if (setup?.playing || setup?.seek !== undefined || setup?.loop) {
          const res = await rt.play();
          if (res.error) throw res.error;
        }
        if (setup?.loop) await rt.setLoopRange(setup.loop);
        if (setup?.seek !== undefined) await rt.seekTo(setup.seek);
        const offsetBefore = e.getTransportOffset();
        const loopBefore = e.getLoopRange();
        const report = await rt.bounceOffline(secs);
        if (!report) throw new Error("bounceOffline returned null");
        return {
          ok: true,
          wav: await toBase64(report.blob),
          haps: report.haps,
          played: report.played,
          skipped: report.skipped,
          cps: e.getCps(),
          offsetBefore,
          loopBefore,
          playingAfter: rt.getIsPlaying(),
          offsetAfter: e.getTransportOffset(),
          loopAfter: e.getLoopRange(),
        };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },

    bounceStats: async (code, secs, sampleRate) => {
      let stage: "load" | "render" = "load";
      const proto = OfflineAudioContext.prototype;
      const realStartRendering = proto.startRendering;
      try {
        const e = await booted();
        const rt = await runtimeOver(e);
        rt.stop();
        e.setTransportOffset(0);
        e.setLoopRange(null);
        loadedCode = code;
        // Load the document exactly as a bounce does; the one-second render is
        // only the side effect of that.
        if (!(await rt.bounceOffline(1))) throw new Error("bounceOffline returned null");
        stage = "render";
        let renderStart = 0;
        let renderEnd = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (proto as any).startRendering = function (this: OfflineAudioContext) {
          renderStart = performance.now();
          const p = realStartRendering.call(this);
          p.then(() => {
            renderEnd = performance.now();
          });
          return p;
        };
        const t0 = performance.now();
        const report = await e.renderLoadedReport(secs, sampleRate);
        const t1 = performance.now();
        const blob = report.blob;
        const frames = (blob.size - 44) / 4;
        const blockRms: number[] = [];
        const second = sampleRate * 4;
        for (let k = 0; k < 10; k++) {
          const start = 44 + Math.floor((frames * k) / 10) * 4;
          const view = new DataView(await blob.slice(start, start + second).arrayBuffer());
          let sum = 0;
          const n = Math.floor(view.byteLength / 2);
          for (let i = 0; i < n; i++) {
            const v = view.getInt16(i * 2, true) / 32768;
            sum += v * v;
          }
          blockRms.push(n === 0 ? 0 : Math.sqrt(sum / n));
        }
        return {
          ok: true,
          sampleRate,
          secs,
          scheduleMs: renderStart - t0,
          renderMs: renderEnd - renderStart,
          encodeMs: t1 - renderEnd,
          bytes: blob.size,
          frames,
          blockRms,
        };
      } catch (err) {
        return { ok: false, stage, error: String(err) };
      } finally {
        proto.startRendering = realStartRendering;
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
