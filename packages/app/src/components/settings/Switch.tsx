"use client";

import React from "react";

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name — required since the visual is icon-only. */
  ariaLabel: string;
  /** Optional native tooltip (used for the disabled-module explanation). */
  title?: string;
  /** Test hook. */
  testId?: string;
}

/**
 * Pill toggle (#739 A1). Replaces the native checkbox + verbose "On (…)"
 * prose the legacy modal wrapped in a `<label>`. A real `<input
 * type=checkbox role=switch>` sits transparently over the visual track so
 * it stays keyboard-operable and screen-reader-labelled; the `.track` /
 * `.thumb` spans are painted by shellStyles.ts off the `:checked` state.
 */
export function Switch({ checked, onChange, disabled, ariaLabel, title, testId }: SwitchProps) {
  return (
    <label className={`sw${disabled ? " locked" : ""}`} title={title}>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        data-testid={testId}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="track" />
      <span className="thumb" />
    </label>
  );
}
