"use client";

import * as React from "react";

import {
  RecordStartError,
  requestPersistentStorage,
  startRecording,
  type ActiveRecording,
  type RecordStartFailure,
} from "../audio/takeRecorder";
import { decodeDurationSeconds, saveTake } from "../audio/saveTake";
import { warmWaveforms } from "../audio/waveformWarm";
import { notifyAssetProvidersChanged } from "./registry";
import { isQuotaError } from "@stave/editor";

/**
 * The record control (#1504) — one button, in the library, beside the assets it
 * produces.
 *
 * Self-contained rather than prop-drilled from the app shell: recording state
 * belongs to the thing that starts it, and threading `recording` /
 * `onRecordToggle` / `error` up to `StaveApp` would put three pieces of state
 * in a component that has no other reason to know about microphones.
 *
 * ## What it says when it cannot record
 *
 * Three refusals need three different sentences, which is why the recorder
 * distinguishes them rather than throwing one error: "you said no" is fixable
 * by the user in browser settings, "no microphone" is not fixable in the app at
 * all, and "this browser cannot" is neither. Flattening them to "recording
 * failed" would leave a user retrying a button that can never work.
 */

const MESSAGES: Record<RecordStartFailure, string> = {
  denied: "Microphone access was denied. Allow it in your browser settings to record.",
  unavailable: "No microphone available.",
  unsupported: "This browser cannot record audio.",
};

/**
 * A take the disk had no room for (#1779).
 *
 * A performance exists nowhere else, so a take the store refused must not be
 * dropped the way it used to be. It is held HERE, at module scope, rather than
 * in component state: the library panel unmounts when it is closed, and state
 * would take the only copy of the take with it. Replaced by the next refused
 * take — the user has had the download link for this one since it failed.
 */
let keptTake: { url: string; filename: string } | null = null;

function keepTake(blob: Blob): { url: string; filename: string } {
  if (keptTake) URL.revokeObjectURL(keptTake.url);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  keptTake = { url: URL.createObjectURL(blob), filename: `stave-take-${stamp}.webm` };
  return keptTake;
}

export function RecordTakeButton(): React.JSX.Element {
  const [kept, setKept] = React.useState(keptTake);
  const [active, setActive] = React.useState<ActiveRecording | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  // Held in a ref as well so unmount-while-recording can release the microphone
  // without waiting for a state read.
  const activeRef = React.useRef<ActiveRecording | null>(null);

  React.useEffect(() => {
    return () => {
      // Leaving the panel mid-recording must not leave the microphone held —
      // the browser would keep showing its indicator with nothing on screen to
      // explain it.
      void activeRef.current?.stop();
      activeRef.current = null;
    };
  }, []);

  const begin = React.useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      // Asked on the first record rather than at boot: a permission-adjacent
      // request the user has not asked for is noise, and until there is a take
      // there is nothing to keep.
      const persisted = await requestPersistentStorage();
      const rec = await startRecording();
      activeRef.current = rec;
      setActive(rec);
      // Reported, not swallowed. A user whose takes are evictable should be
      // able to find that out; a silent request is a guarantee nobody can check.
      if (persisted === "denied") {
        setMessage("Recording. Note: the browser may evict stored takes.");
      }
    } catch (err) {
      const reason = err instanceof RecordStartError ? err.reason : "unavailable";
      setMessage(MESSAGES[reason]);
    } finally {
      setBusy(false);
    }
  }, []);

  const finish = React.useCallback(async () => {
    const rec = activeRef.current;
    if (!rec) return;
    setBusy(true);
    let blob: Blob | null = null;
    try {
      blob = await rec.stop();
      activeRef.current = null;
      setActive(null);
      const { record, playable } = await saveTake(blob, {
        measureDuration: decodeDurationSeconds,
      });
      // The provider reads records live, so the panel only needs telling that
      // the catalog changed.
      notifyAssetProvidersChanged();
      // #1506 — and decode it, so the take can be SEEN on the Song timeline
      // without first being played. Only when it registered: an unplayable take
      // has no URL to decode, and warming would be a guaranteed miss.
      if (playable) void warmWaveforms([record.name]);
      setMessage(
        playable
          ? `Saved ${record.name}`
          : `Saved ${record.name}, but it could not be loaded for playback`,
      );
    } catch (err) {
      if (blob && isQuotaError(err)) {
        setKept(keepTake(blob));
        setMessage("Storage is full — this take was not saved. Download it to keep it.");
      } else {
        setMessage("The recording could not be saved.");
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const recording = active != null;

  return (
    <>
      <button
        style={{ ...styles.button, ...(recording ? styles.recording : null) }}
        onClick={() => void (recording ? finish() : begin())}
        disabled={busy}
        title={recording ? "Stop recording" : "Record a take"}
        aria-label={recording ? "Stop recording" : "Record a take"}
        aria-pressed={recording}
        data-record-take
        data-recording={recording ? "true" : "false"}
      >
        <span style={styles.dot} aria-hidden />
        {recording ? "STOP" : "REC"}
      </button>
      {message && (
        <div style={styles.message} role="status" data-record-message>
          {message}
        </div>
      )}
      {kept && (
        <a
          href={kept.url}
          download={kept.filename}
          style={{ ...styles.message, display: "block", color: "var(--accent-strong, #6ab)" }}
          data-record-kept-download
        >
          Download take ({kept.filename})
        </a>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  button: {
    background: "none",
    border: "1px solid var(--border-subtle)",
    borderRadius: 3,
    color: "var(--text-secondary)",
    cursor: "pointer",
    padding: "2px 6px",
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.6,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  recording: {
    color: "var(--danger, #e5484d)",
    borderColor: "var(--danger, #e5484d)",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "currentColor",
    display: "inline-block",
  },
  message: {
    padding: "6px 14px",
    fontSize: 10,
    lineHeight: 1.4,
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border-subtle)",
  },
};
