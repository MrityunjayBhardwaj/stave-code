"use client";

import React from "react";

interface SettingRowProps {
  name: string;
  description?: string;
  /** Small pill after the name (e.g. "Advanced", "⌥P"). */
  badge?: React.ReactNode;
  /** Nested / advanced row — indented, no top border. */
  indent?: boolean;
  /** Dim the name (used for the indented "Custom resolution" override row). */
  dimName?: boolean;
  /** The control(s) on the right. */
  children: React.ReactNode;
}

/**
 * A single settings row (#739 A1): `[name + description] … [control]`.
 * Replaces the legacy 110px-label grid `Row` and the verbose "On (…)"
 * state prose — the description now lives under the name and the control
 * (a Switch / select / slider) carries its own state visually.
 */
export function SettingRow({ name, description, badge, indent, dimName, children }: SettingRowProps) {
  return (
    <div className={`row${indent ? " indent" : ""}`}>
      <div className="rlabel">
        <div className={`rname${dimName ? " dim" : ""}`}>
          {name}
          {badge}
        </div>
        {description ? <div className="rdesc">{description}</div> : null}
      </div>
      <div className="rctl">{children}</div>
    </div>
  );
}
