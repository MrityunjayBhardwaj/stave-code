/**
 * trackEnvelopeRelay — one stable handle on the ACTIVE runtime's synth-track
 * renders (#1731), for a timeline that is registered once and outlives tabs.
 *
 * The Timeline tab is registered once at app mount and reads every runtime
 * accessor through refs, so it never learns that the active file changed. That
 * is fine for a call — the ref answers from the new runtime — but a
 * SUBSCRIPTION made through a ref stays attached to the runtime that was active
 * when it was made, and the timeline would never hear from the new one. So the
 * relay owns the listeners, and `attach` moves its one upstream subscription to
 * whichever runtime is active now, telling its listeners when that changes the
 * answer (a different file's envelopes).
 */

import type { TrackEnvelopeAccess } from "@stave/editor";

export interface TrackEnvelopeRelay {
  /** Stable for the life of the app: hand this to the timeline. */
  readonly access: TrackEnvelopeAccess;
  /** Point the relay at the active runtime's handle, keyed by its file. */
  attach(fileId: string | null, source: TrackEnvelopeAccess | null): void;
}

export function createTrackEnvelopeRelay(): TrackEnvelopeRelay {
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  let source: TrackEnvelopeAccess | null = null;
  let sourceFile: string | null = null;
  let unsubscribe: (() => void) | null = null;

  return {
    access: {
      request: (trackIds, cycles) => source?.request(trackIds, cycles),
      get: (trackId) => source?.get(trackId) ?? null,
      status: () => source?.status() ?? { rendering: null, overCap: [] },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    attach(fileId, next) {
      // Re-subscribed on every attach, not only on a file change: the handle for
      // the same file is rebuilt with the runtime-state bundle, and a runtime
      // recreated for that file would otherwise keep us on its disposed engine.
      unsubscribe?.();
      unsubscribe = next?.subscribe(notify) ?? null;
      source = next;
      if (fileId !== sourceFile) {
        sourceFile = fileId;
        notify();
      }
    },
  };
}
