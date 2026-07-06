"use client";

import React from "react";
import { useRulerUnits, toggleRulerUnits } from "../state/rulerUnits";

/**
 * CYCLES / BARS units toggle (#750) for the editor pattern (Strudel) chrome
 * bar. Moved off the Timeline controls — the Timeline ruler now reads the
 * shared `rulerUnits` store this button writes. Styled to match the sibling
 * SetBackdropButton chrome chip.
 */
export function RulerUnitsButton(): React.ReactElement {
  const units = useRulerUnits();
  const cycles = units === "cycles";
  return (
    <button
      data-testid="strudel-chrome-units-toggle"
      data-units={units}
      onClick={() => toggleRulerUnits()}
      title={cycles ? "Ruler: cycles — click for bars & beats" : "Ruler: bars & beats — click for cycles"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: 3,
        fontSize: 10,
        letterSpacing: "0.08em",
        fontFamily: "var(--font-mono), ui-monospace, monospace",
        cursor: "pointer",
        userSelect: "none",
        background: "none",
        color: "var(--foreground-muted)",
        border: "1px solid var(--border)",
      }}
    >
      {cycles ? "CYCLES" : "BARS"}
    </button>
  );
}
