"use client";

import React from "react";

/**
 * Codicon — VS Code's icon font, loaded via @vscode/codicons in
 * globals.css. Pass the codicon name (without the `codicon-` prefix);
 * see https://microsoft.github.io/vscode-codicons/dist/codicon.html
 * for the full set.
 *
 * Wrapped as a tiny component so call sites stay short and so future
 * swaps (different icon set, custom SVGs) need only one edit.
 */
export interface IconProps {
  name: string;
  size?: number | string;
  title?: string;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({
  name,
  size,
  title,
  ariaLabel,
  className,
  style,
}: IconProps): React.ReactElement {
  const merged: React.CSSProperties = {
    fontSize: typeof size === "number" ? `${size}px` : size,
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    ...style,
  };
  return (
    <span
      className={`codicon codicon-${name}${className ? ` ${className}` : ""}`}
      title={title}
      aria-label={ariaLabel ?? title}
      role={ariaLabel || title ? "img" : undefined}
      style={merged}
    />
  );
}
