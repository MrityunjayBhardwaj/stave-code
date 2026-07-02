/**
 * Theme tokens applied to the WorkspaceShell root via inline CSS vars.
 *
 * Surface / text / border / accent tokens are NOT included here — they
 * come from globals.css's [data-stave-theme="dark|light"] selectors so
 * the editor chrome and the app chrome share one palette. Only
 * code-specific tokens (syntax colours, stem colours) live here.
 *
 * `--font-mono` is deliberately NOT set here. The host owns the mono font:
 * the app loads the real face via next/font and defines `--font-mono` on
 * `<html>`, and the editor inherits it. Setting it inline on the shell root
 * would win the cascade and pin the editor UI to an unbacked literal
 * (system-mono fallback) — the #691 bug. Leave it to the host.
 */

export const DARK_THEME_TOKENS: Record<string, string> = {
  '--accent-rgb':          '106, 106, 200',
  '--stem-drums':          '#f97316',
  '--stem-bass':           '#06b6d4',
  '--stem-melody':         '#a78bfa',
  '--stem-pad':            '#10b981',
  '--code-bg':             '#090912',
  '--code-foreground':     '#c4b5fd',
  '--code-caret':          '#7c7cff',
  '--code-selection':      'rgba(124,124,255,0.25)',
  '--code-line-highlight': 'rgba(124,124,255,0.05)',
  '--code-note':           '#86efac',
  '--code-function':       '#93c5fd',
  '--code-string':         '#fcd34d',
  '--code-number':         '#fb923c',
  '--code-comment':        'rgba(255,255,255,0.25)',
  '--code-active-hap':     'rgba(124,124,255,0.3)',
}

export const LIGHT_THEME_TOKENS: Record<string, string> = {
  '--accent-rgb':          '85, 85, 184',
  '--stem-drums':          '#ea580c',
  '--stem-bass':           '#0891b2',
  '--stem-melody':         '#5555b8',
  '--stem-pad':            '#059669',
  '--code-bg':             '#f0f0f6',
  '--code-foreground':     '#1e1b4b',
  '--code-caret':          '#4a4ae0',
  '--code-selection':      'rgba(74,74,224,0.2)',
  '--code-line-highlight': 'rgba(74,74,224,0.04)',
  '--code-note':           '#15803d',
  '--code-function':       '#1d4ed8',
  '--code-string':         '#92400e',
  '--code-number':         '#c2410c',
  '--code-comment':        'rgba(0,0,0,0.3)',
  '--code-active-hap':     'rgba(74,74,224,0.25)',
}

export interface StrudelTheme {
  tokens: Record<string, string>
}

export function applyTheme(
  el: HTMLElement,
  theme: 'dark' | 'light' | StrudelTheme
): void {
  const tokens =
    theme === 'dark'
      ? DARK_THEME_TOKENS
      : theme === 'light'
      ? LIGHT_THEME_TOKENS
      : (theme as StrudelTheme).tokens

  for (const [key, value] of Object.entries(tokens)) {
    el.style.setProperty(key, value)
  }
}
