/**
 * Dialog host — promise-based replacement for window.prompt / confirm /
 * alert. A single <DialogHost /> is mounted in StaveApp; any caller
 * anywhere invokes the imperative API and awaits the result.
 */

export type DialogState =
  | {
      kind: "prompt";
      id: number;
      title: string;
      description?: string;
      initialValue: string;
      placeholder?: string;
      confirmLabel?: string;
      resolve: (value: string | null) => void;
    }
  | {
      kind: "confirm";
      id: number;
      title: string;
      description?: string;
      confirmLabel?: string;
      danger?: boolean;
      resolve: (value: boolean) => void;
    };

export interface ToastState {
  id: number;
  message: string;
  level: "info" | "error";
  expiresAt: number;
  /**
   * How many times this message has been shown. Repeat emits with the
   * same `(message, level)` bump this count + extend `expiresAt`
   * instead of stacking another toast — so a per-frame flood (e.g., a
   * draw-loop ReferenceError) renders as one toast with a counter
   * rather than covering the screen.
   */
  count: number;
}

type Listener = () => void;

let dialog: DialogState | null = null;
let toasts: ToastState[] = [];
const listeners = new Set<Listener>();
let seq = 0;

function notify() { for (const l of listeners) l(); }

export function subscribeToDialog(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getDialog(): DialogState | null { return dialog; }
export function getToasts(): ToastState[] { return toasts; }

export function closeDialog(): void {
  if (!dialog) return;
  const d = dialog;
  dialog = null;
  notify();
  // Resolve any pending promise with a cancel value.
  if (d.kind === "prompt") d.resolve(null);
  else d.resolve(false);
}

export function showPrompt(opts: {
  title: string;
  description?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    dialog = {
      kind: "prompt",
      id: ++seq,
      title: opts.title,
      description: opts.description,
      initialValue: opts.initialValue ?? "",
      placeholder: opts.placeholder,
      confirmLabel: opts.confirmLabel ?? "OK",
      resolve,
    };
    notify();
  });
}

export function showConfirm(opts: {
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    dialog = {
      kind: "confirm",
      id: ++seq,
      title: opts.title,
      description: opts.description,
      confirmLabel: opts.confirmLabel ?? "OK",
      danger: opts.danger,
      resolve,
    };
    notify();
  });
}

/** Internal — called by the host when the user hits OK on a prompt. */
export function resolvePrompt(value: string): void {
  if (!dialog || dialog.kind !== "prompt") return;
  const d = dialog;
  dialog = null;
  notify();
  d.resolve(value);
}

/** Internal — called by the host when the user hits Confirm. */
export function resolveConfirm(value: boolean): void {
  if (!dialog || dialog.kind !== "confirm") return;
  const d = dialog;
  dialog = null;
  notify();
  d.resolve(value);
}

export function showToast(message: string, level: "info" | "error" = "info", ttlMs = 4000): void {
  // Dedupe: if the most recent visible toast carries the same message +
  // level, bump its count and extend its expiry instead of stacking a
  // new one. The scheduled cleanup below re-reads `expiresAt` so the
  // reused toast lives `ttlMs` from the latest emit, not from the
  // first.
  const existing = toasts.find(
    (x) => x.message === message && x.level === level,
  );
  if (existing) {
    existing.count += 1;
    existing.expiresAt = Date.now() + ttlMs;
    toasts = [...toasts];
    notify();
    scheduleToastCleanup(existing.id);
    return;
  }
  const t: ToastState = {
    id: ++seq,
    message,
    level,
    expiresAt: Date.now() + ttlMs,
    count: 1,
  };
  toasts = [...toasts, t];
  notify();
  scheduleToastCleanup(t.id);
}

/**
 * Schedule a cleanup check against the current `expiresAt`. Re-firing
 * showToast for the same message bumps `expiresAt` and schedules a new
 * check; whichever check wakes last actually removes the toast
 * (earlier checks see a still-future expiry and re-arm). Keeps the
 * dedupe logic self-contained — no per-toast timeout ids to track.
 */
function scheduleToastCleanup(id: number): void {
  const toast = toasts.find((x) => x.id === id);
  if (!toast) return;
  const delay = Math.max(0, toast.expiresAt - Date.now());
  setTimeout(() => {
    const current = toasts.find((x) => x.id === id);
    if (!current) return;
    if (current.expiresAt > Date.now()) {
      scheduleToastCleanup(id);
      return;
    }
    toasts = toasts.filter((x) => x.id !== id);
    notify();
  }, delay);
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}
