"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bounceOffers,
  formatDuration,
  type BounceSizing,
} from "./songLength";

/**
 * #1346 — "Bounce to WAV": the first way to get audio out of Stave.
 *
 * It is backed by `LiveRecorder`, which captures the real graph, so a bounce is
 * genuinely REAL-TIME — thirty seconds of audio costs thirty seconds of wall
 * clock. That is the whole reason this is a modal with a progress bar and a
 * Stop button rather than a menu item with a spinner: the user has to wait, and
 * the UI must say so instead of looking hung.
 *
 * Stopping is not a discard. The recorder resolves with what it captured, so
 * Stop yields a shorter file rather than nothing.
 */

/**
 * Fixed lengths, in seconds. Real-time, so each is also its own cost.
 *
 * These are the fallback, not the point: they are the only thing on offer for a
 * document whose length cannot be measured (56 of 142 real documents have no
 * measurable period, #1365). The 60s ceiling is gone — it existed only because
 * every option had to be a number someone picked by hand.
 */
const DURATIONS = [8, 16, 30, 60, 120, 300] as const;

export type BounceState =
  | { phase: "choosing" }
  /**
   * #1356 — between Start and the first captured sample. The graph is allowed
   * to fall silent first, because a take started while the previous one is
   * still ringing records both. Usually imperceptible; up to ~1.3s when the
   * user bounces straight after stopping.
   */
  | { phase: "preparing" }
  | { phase: "recording"; seconds: number; elapsed: number }
  | { phase: "encoding" };

interface BounceModalProps {
  open: boolean;
  /** Progress state, owned by the caller so the timer survives re-renders. */
  state: BounceState;
  /**
   * What the document says about its own length, or `null` while that is still
   * being measured — which is NOT the same as "it has no length", and renders as
   * the plain seconds picker rather than as a refusal.
   */
  sizing: BounceSizing | null;
  onClose: () => void;
  onStart: (seconds: number) => void;
  onStop: () => void;
}

export function BounceModal({
  open,
  state,
  sizing,
  onClose,
  onStart,
  onStop,
}: BounceModalProps) {
  const [selected, setSelected] = useState<number>(DURATIONS[0]);
  const startBtnRef = useRef<HTMLButtonElement>(null);

  const { offers, note } = useMemo(() => bounceOffers(sizing), [sizing]);

  // When the measurement lands, move the default onto the document's own answer
  // — the whole point is that the user should not have to translate bars into
  // seconds. Only while CHOOSING, and only until they touch something: re-running
  // this after a manual pick would fight the user for the selection.
  const tookSongDefault = useRef(false);
  useEffect(() => {
    if (!open) {
      tookSongDefault.current = false;
      return;
    }
    if (tookSongDefault.current || offers.length === 0) return;
    tookSongDefault.current = true;
    setSelected(offers[0].seconds);
  }, [open, offers]);

  useEffect(() => {
    if (open && state.phase === "choosing") startBtnRef.current?.focus();
  }, [open, state.phase]);

  // Escape closes while choosing, and stops while recording — it must never
  // dismiss the modal mid-take, or the recorder would keep running with its
  // progress invisible and the transport still under its control.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (state.phase === "choosing") onClose();
      else if (state.phase === "recording" || state.phase === "preparing") onStop();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, state.phase, onClose, onStop]);

  const handleStart = useCallback(() => onStart(selected), [onStart, selected]);

  if (!open) return null;

  const recording = state.phase === "recording";
  const pct = recording ? Math.min(100, (state.elapsed / state.seconds) * 100) : 0;

  return (
    <div
      style={styles.backdrop}
      // Only a click-out while choosing dismisses — same reasoning as Escape.
      onClick={state.phase === "choosing" ? onClose : undefined}
    >
      <div
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Bounce to WAV"
      >
        <div style={styles.header}>
          <h2 style={styles.title}>Bounce to WAV</h2>
          {state.phase === "choosing" && (
            <button style={styles.closeBtn} onClick={onClose} aria-label="Close">
              ×
            </button>
          )}
        </div>

        <div style={styles.body}>
          {state.phase === "choosing" && (
            <>
              {offers.length > 0 && (
                <>
                  <div style={styles.sectionLabel}>This song</div>
                  <div style={styles.grid} data-testid="bounce-song-offers">
                    {offers.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setSelected(o.seconds)}
                        aria-pressed={o.seconds === selected}
                        style={{
                          ...styles.card,
                          ...(o.seconds === selected ? styles.cardSelected : {}),
                        }}
                      >
                        <div style={styles.cardName}>{o.label}</div>
                        <div style={styles.cardSub}>{formatDuration(o.seconds)}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {note && (
                <p style={styles.note} data-testid="bounce-length-note">
                  {note}
                </p>
              )}

              <div style={styles.sectionLabel}>
                {offers.length > 0 ? "Or a fixed length" : "Length"}
              </div>
              <div style={styles.grid}>
                {DURATIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelected(d)}
                    aria-pressed={d === selected}
                    style={{
                      ...styles.card,
                      ...(d === selected ? styles.cardSelected : {}),
                    }}
                  >
                    <div style={styles.cardName}>{d}s</div>
                  </button>
                ))}
              </div>
              <p style={styles.note}>
                Bouncing records the live output, so it takes as long as it plays —
                this one will take{" "}
                {/* ROUNDED, not raw. Under a minute this deliberately reads
                    "13 seconds" rather than "0:13" — natural for the fixed
                    picks, which are whole numbers anyway. But a SONG-derived
                    length is `cycles / cps`, so `selected` is usually a
                    repeating decimal, and interpolating it bare printed
                    "13.333333333333334 seconds" here. The `>= 60` branch hid
                    this: it formats, so only songs under a minute showed it. */}
                {selected < 60
                  ? `${Math.round(selected)} seconds`
                  : formatDuration(selected)}
                .
                Playback starts
                automatically and stops again when the bounce finishes.
              </p>
            </>
          )}

          {recording && (
            <>
              <div style={styles.sectionLabel}>
                {/* Both sides go through `formatDuration`, which is what the
                    chooser above already shows. A song's length is `cycles /
                    cps` and is usually a repeating decimal — 40 cycles at 0.55
                    cps is 72.72727272727272 — so an unformatted `state.seconds`
                    put fifteen digits on screen for the whole take, next to a
                    card that said "1:13". */}
                Recording — {formatDuration(state.elapsed)} of{" "}
                {formatDuration(state.seconds)}
              </div>
              <div
                style={styles.track}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={state.seconds}
                aria-valuenow={Math.floor(state.elapsed)}
              >
                <div style={{ ...styles.fill, width: `${pct}%` }} />
              </div>
              <p style={styles.note}>
                Stopping early keeps what has been recorded so far.
              </p>
            </>
          )}

          {state.phase === "preparing" && (
            <div style={styles.sectionLabel}>Waiting for the audio to settle…</div>
          )}

          {state.phase === "encoding" && (
            <div style={styles.sectionLabel}>Encoding WAV…</div>
          )}
        </div>

        <div style={styles.footer}>
          {state.phase === "choosing" ? (
            <>
              <button style={styles.cancelBtn} onClick={onClose}>
                Cancel
              </button>
              <button ref={startBtnRef} style={styles.primaryBtn} onClick={handleStart}>
                Start Bounce
              </button>
            </>
          ) : (
            <button
              style={styles.cancelBtn}
              onClick={onStop}
              // Live during `preparing` too: aborting before the first sample is
              // well-defined (the recorder sees an already-aborted signal and
              // resolves at once), so the user is never stranded in the settle.
              disabled={state.phase === "encoding"}
            >
              Stop
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────
// Mirrors TemplateModal so the two read as one chrome.

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "var(--bg-overlay)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    fontFamily: "system-ui, -apple-system, sans-serif",
  },
  modal: {
    width: 420,
    maxWidth: "90vw",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    color: "var(--text-chrome)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 20px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: { margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-primary)" },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-icon)",
    fontSize: 24,
    cursor: "pointer",
    padding: "0 4px",
    lineHeight: 1,
  },
  body: { padding: "16px 20px" },
  sectionLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--text-tertiary)",
    marginBottom: 10,
    fontWeight: 600,
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 },
  card: {
    background: "var(--bg-panel)",
    border: "1px solid var(--border-subtle)",
    borderRadius: 6,
    padding: "12px 0",
    cursor: "pointer",
    color: "var(--text-chrome)",
    transition: "all 0.1s",
  },
  cardSelected: {
    background: "var(--bg-hover)",
    borderColor: "var(--accent)",
    boxShadow: "0 0 0 1px var(--accent)",
  },
  cardName: { fontSize: 14, fontWeight: 600 },
  cardSub: { fontSize: 12, opacity: 0.7, marginTop: 2 },
  note: {
    margin: "14px 0 0",
    fontSize: 12,
    lineHeight: 1.5,
    color: "var(--text-tertiary)",
  },
  track: {
    height: 6,
    borderRadius: 3,
    background: "var(--bg-panel)",
    border: "1px solid var(--border-subtle)",
    overflow: "hidden",
  },
  fill: { height: "100%", background: "var(--accent)", transition: "width 0.2s linear" },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    padding: "12px 20px 16px",
    borderTop: "1px solid var(--border-subtle)",
  },
  cancelBtn: {
    background: "none",
    border: "1px solid var(--border-subtle)",
    borderRadius: 5,
    color: "var(--text-chrome)",
    padding: "7px 14px",
    fontSize: 13,
    cursor: "pointer",
  },
  primaryBtn: {
    background: "var(--accent)",
    border: "1px solid var(--accent)",
    borderRadius: 5,
    color: "#fff",
    padding: "7px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
};
