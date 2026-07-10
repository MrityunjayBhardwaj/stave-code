"use client";

import React, { useEffect, useRef } from "react";
import { useRulerUnits, toggleRulerUnits } from "../state/rulerUnits";

/**
 * TransportLCD (#857) — a backlit hardware-style readout for the menubar's
 * centered slot: transport state, cycle position, tempo, and frame health.
 *
 * Data comes from the accessors the timeline already reads (`getCycle`/
 * `getCps` on the active runtime) plus `isPlaying`. The fast-changing numbers
 * (position, tempo, FPS) are written straight to DOM refs on a rAF loop so the
 * menubar never re-renders per frame; only the slow state (isPlaying, mode)
 * flows through React.
 *
 * Display mode reuses the app-wide Ruler-units preference — CYCLES shows
 * `CYC 042.3 · 0.50 CPS`, BARS shows `BAR 011.3.1 · 120 BPM` — and clicking
 * the screen flips it, keeping the LCD and the timeline ruler in agreement.
 *
 * The screen palette is fixed dark in both themes: a backlit display reads as
 * a screen, not a themed card. The bezel/labels ride the chrome tokens.
 */

interface TransportLCDProps {
  readonly isPlaying: boolean;
  readonly getCycle: () => number | null;
  readonly getCps: () => number | null;
}

const STYLE_ID = "stave-transport-lcd-styles";

function ensureLcdStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .stave-lcd {
      position: relative; display: flex; align-items: stretch; height: 22px;
      border-radius: 4px; padding: 0 2px; overflow: hidden; cursor: pointer;
      font-family: var(--font-mono, ui-monospace, "SF Mono", Menlo, Consolas, monospace);
      background: linear-gradient(180deg, #0a0a1a, #05050e);
      border: 1px solid #01010a;
      box-shadow: inset 0 1px 0 rgba(160,168,255,0.06),
                  inset 0 0 12px rgba(80,90,200,0.14),
                  0 0 0 1px rgba(120,124,255,0.10), 0 1px 2px rgba(0,0,0,0.6);
    }
    .stave-lcd:focus-visible { outline: 2px solid #7c7cff; outline-offset: 2px; }
    .stave-lcd::after {
      content: ""; position: absolute; inset: 0; border-radius: 4px; pointer-events: none;
      background: repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(0,0,0,0.16) 3px);
      mix-blend-mode: multiply; opacity: .5;
    }
    .stave-lcd-seg { display: flex; align-items: center; gap: 5px; padding: 0 8px; height: 100%; }
    .stave-lcd-seg + .stave-lcd-seg { box-shadow: inset 1px 0 0 rgba(120,124,255,0.10); }
    .stave-lcd-label { font-size: 8px; letter-spacing: 0.14em; color: #6f6fa0; text-transform: uppercase; line-height: 1; }
    .stave-lcd-dot { width: 7px; height: 7px; border-radius: 50%; background: #6f6fa0; flex: none; transition: background .15s, box-shadow .15s; }
    .stave-lcd.run .stave-lcd-dot { background: #6bff8c; box-shadow: 0 0 6px rgba(107,255,140,0.55); animation: stave-lcd-pulse 1.05s ease-in-out infinite; }
    @keyframes stave-lcd-pulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
    .stave-lcd-state { font-size: 8px; letter-spacing: 0.16em; color: #6f6fa0; text-transform: uppercase; }
    .stave-lcd.run .stave-lcd-state { color: #6bff8c; }
    .stave-lcd-readout { position: relative; display: inline-grid; }
    .stave-lcd-readout > span { grid-area: 1 / 1; font-variant-numeric: tabular-nums; letter-spacing: 0.06em; font-size: 13px; font-weight: 600; white-space: pre; }
    .stave-lcd-ghost { color: rgba(150,158,255,0.10); }
    .stave-lcd-live { color: #bcc2ff; text-shadow: 0 0 6px rgba(150,158,255,0.55), 0 0 1px rgba(190,196,255,0.9); }
    .stave-lcd-tempo { font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 600; color: #9aa0e6; text-shadow: 0 0 5px rgba(140,148,230,0.4); letter-spacing: .04em; }
    .stave-lcd-fps { display: flex; align-items: center; gap: 6px; }
    .stave-lcd-bars { display: flex; align-items: flex-end; gap: 1.5px; height: 11px; }
    .stave-lcd-bars i { width: 2.5px; background: #6f6fa0; border-radius: 1px; opacity: .3; }
    .stave-lcd-bars i.on { opacity: 1; }
    .stave-lcd-fps.good .stave-lcd-bars i.on { background: #6bff8c; box-shadow: 0 0 4px rgba(107,255,140,.55); }
    .stave-lcd-fps.warn .stave-lcd-bars i.on { background: #ffcf7a; box-shadow: 0 0 4px rgba(255,207,122,.5); }
    .stave-lcd-fps.crit .stave-lcd-bars i.on { background: #ff8080; box-shadow: 0 0 4px rgba(255,128,128,.5); }
    .stave-lcd-fpsnum { font-variant-numeric: tabular-nums; font-size: 11px; font-weight: 600; color: #9aa0e6; }
    @media (prefers-reduced-motion: reduce) { .stave-lcd.run .stave-lcd-dot { animation: none; } }
  `;
  document.head.appendChild(style);
}

const DASH = "—";

/** `042.3` — three integer digits, one fractional. */
function fmtCycle(c: number): string {
  const [a, b] = c.toFixed(1).split(".");
  return `${a.padStart(3, "0")}.${b}`;
}

/** `011.3.1` — bar·beat·tick (one cycle ≈ one bar, quarter-cycle beats). */
function fmtBar(c: number): string {
  const bar = Math.floor(c) + 1;
  const beat = Math.floor((c % 1) * 4) + 1;
  const tick = Math.floor(((c * 4) % 1) * 4) + 1;
  return `${String(bar).padStart(3, "0")}.${beat}.${tick}`;
}

export function TransportLCD({ isPlaying, getCycle, getCps }: TransportLCDProps): React.ReactElement {
  const units = useRulerUnits();
  const cycleMode = units === "cycles";

  // Keep the fast-path accessors and the current mode in refs so the rAF loop
  // (mounted once) always reads the latest without restarting per render.
  const getCycleRef = useRef(getCycle);
  const getCpsRef = useRef(getCps);
  const cycleModeRef = useRef(cycleMode);
  getCycleRef.current = getCycle;
  getCpsRef.current = getCps;
  cycleModeRef.current = cycleMode;

  const posRef = useRef<HTMLSpanElement>(null);
  const tempoRef = useRef<HTMLSpanElement>(null);
  const fpsWrapRef = useRef<HTMLDivElement>(null);
  const fpsNumRef = useRef<HTMLSpanElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureLcdStyles();
    let raf = 0;
    let last = performance.now();
    let fps = 60;
    let acc = 0;

    const tick = (now: number): void => {
      const dt = Math.max(0.001, (now - last) / 1000);
      last = now;
      // FPS from the rAF delta, smoothed so it reads steady not jittery.
      fps += (1 / dt - fps) * 0.1;

      acc += dt;
      if (acc >= 0.08) {
        acc = 0;
        const cps = getCpsRef.current();
        const cyc = getCycleRef.current();
        const inCycle = cycleModeRef.current;

        if (posRef.current) {
          posRef.current.textContent =
            cyc === null ? `${DASH} ${DASH}` : inCycle ? fmtCycle(cyc) : fmtBar(cyc);
        }
        if (tempoRef.current) {
          tempoRef.current.textContent =
            cps === null ? `${DASH}${DASH}` : inCycle ? cps.toFixed(2) : String(Math.round(cps * 240));
        }

        const shown = Math.max(1, Math.round(fps));
        if (fpsNumRef.current) fpsNumRef.current.textContent = String(Math.min(shown, 120));
        const cls = shown >= 55 ? "good" : shown >= 30 ? "warn" : "crit";
        if (fpsWrapRef.current) fpsWrapRef.current.className = `stave-lcd-fps ${cls}`;
        const lit = Math.round((Math.min(shown, 60) / 60) * 5);
        if (barsRef.current) {
          const bars = barsRef.current.children;
          for (let i = 0; i < bars.length; i++) {
            (bars[i] as HTMLElement).classList.toggle("on", i < lit);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={`stave-lcd${isPlaying ? " run" : ""}`}
      role="button"
      tabIndex={0}
      data-stave-transport-lcd
      aria-label="Transport display — click to switch between cycle and bar display"
      onClick={toggleRulerUnits}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleRulerUnits();
        }
      }}
    >
      <div className="stave-lcd-seg">
        <span className="stave-lcd-dot" />
        <span className="stave-lcd-state">{isPlaying ? "PLAY" : "STOP"}</span>
      </div>
      <div className="stave-lcd-seg">
        <span className="stave-lcd-label">{cycleMode ? "CYC" : "BAR"}</span>
        <span className="stave-lcd-readout">
          <span className="stave-lcd-ghost">{cycleMode ? "888.8" : "888.8.8"}</span>
          <span className="stave-lcd-live" ref={posRef} data-stave-lcd-pos>
            {cycleMode ? "000.0" : "000.0.0"}
          </span>
        </span>
      </div>
      <div className="stave-lcd-seg">
        <span className="stave-lcd-tempo" ref={tempoRef} data-stave-lcd-tempo>
          {DASH}
        </span>
        <span className="stave-lcd-label">{cycleMode ? "CPS" : "BPM"}</span>
      </div>
      <div className="stave-lcd-seg">
        <div className="stave-lcd-fps good" ref={fpsWrapRef}>
          <div className="stave-lcd-bars" ref={barsRef}>
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} style={{ height: `${5 + i * 1.5}px` }} />
            ))}
          </div>
          <span className="stave-lcd-fpsnum" ref={fpsNumRef}>
            60
          </span>
        </div>
        <span className="stave-lcd-label">FPS</span>
      </div>
    </div>
  );
}
