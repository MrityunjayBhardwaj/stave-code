/**
 * Command registry — app-level.
 *
 * Every user-invokable action is registered here as a Command. The menu
 * bar, context menus, palette, keybindings, and activity bar are all
 * thin dispatchers over this registry. New features ship by registering
 * a command; they automatically get a palette entry + a configurable
 * keybinding slot.
 *
 * Design mirrors VSCode's pattern — see monorepo AGENTS.md for
 * rationale. Keep this module free of React state; use subscriptions.
 */

export interface Command {
  /** Stable machine id, namespaced: 'stave.file.new'. */
  readonly id: string;
  /** Human-readable title, shown in palette / menu. */
  readonly title: string;
  /** Optional grouping for palette ('File', 'Edit', 'View', 'Project'). */
  readonly category?: string;
  /** Suggested keybinding in chord-string form ('mod+n', 'mod+shift+z'). */
  readonly keybinding?: string;
  /** Runs the command. Can be sync or async; errors are logged. */
  readonly run: () => void | Promise<void>;
  /**
   * Optional gate — return false to hide from palette / disable in menu.
   * Re-evaluated on every read; cheap.
   */
  readonly when?: () => boolean;
  /** Optional trailing description for the palette. */
  readonly description?: string;
  /**
   * Extra DEFAULT chords, beside `keybinding` (#1795). Delete on a Mac keyboard
   * sends `Backspace`, so a "delete" gesture needs both out of the box. A user
   * rebind replaces the whole set with the one chord they chose.
   */
  readonly alternateKeybindings?: readonly string[];
  /**
   * The panel this command belongs to (#1795). A scoped command is NEVER run by
   * the global keybinding dispatcher: its panel matches its own keystrokes
   * (`matchScopedCommand`) while it has focus, so `S` or `Delete` pressed
   * anywhere else does nothing. Unscoped = global.
   */
  readonly scope?: string;
}

type Listener = () => void;

const commands = new Map<string, Command>();
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l();
}

/**
 * Register a command. If a command with the same id exists it's
 * replaced. Returns an unregister function so callers can scope
 * dynamic commands to a React effect.
 */
export function registerCommand(cmd: Command): () => void {
  commands.set(cmd.id, cmd);
  notify();
  return () => {
    const current = commands.get(cmd.id);
    if (current === cmd) {
      commands.delete(cmd.id);
      notify();
    }
  };
}

/** Return every registered command in insertion order. */
export function listCommands(): Command[] {
  return Array.from(commands.values());
}

/** Return the commands whose `when` currently resolves to true. */
export function listEnabledCommands(): Command[] {
  return listCommands().filter((c) => !c.when || c.when());
}

/** Look up a command by id. */
export function getCommand(id: string): Command | undefined {
  return commands.get(id);
}

/**
 * Execute a command by id. Returns true if the command was found and
 * its `when` gate (if any) passed; false otherwise. Errors during
 * `run` are caught + logged so a misbehaving command can't take down
 * the keybinding dispatcher.
 */
export function executeCommand(id: string): boolean {
  const cmd = commands.get(id);
  if (!cmd) return false;
  if (cmd.when && !cmd.when()) return false;
  try {
    const result = cmd.run();
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch((err) => {
        console.warn(`[stave] command '${id}' failed:`, err);
      });
    }
  } catch (err) {
    console.warn(`[stave] command '${id}' threw:`, err);
  }
  return true;
}

/**
 * Subscribe to registry mutations (register / unregister). Callers
 * receive a tick whenever the command set changes. Useful for a
 * palette that wants to re-render its list on hot changes.
 */
export function subscribeToCommands(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * #1795 — what a mounted panel answers for its scope: whether a command applies
 * right now (a section is selected, the gesture fits it), and running it.
 * `run` returns whether it acted, so a key handler knows to claim the event.
 */
export interface ScopeHandler {
  canRun(id: string): boolean;
  run(id: string): boolean;
}

const scopeHandlers = new Map<string, ScopeHandler>();

/**
 * Install the handler for `scope` while a panel is mounted. Returns a release
 * that only removes THIS handler, so a remount that installed a newer one
 * before the old one's cleanup ran keeps the newer one.
 */
export function setScopeHandler(scope: string, handler: ScopeHandler): () => void {
  scopeHandlers.set(scope, handler);
  notify();
  return () => {
    if (scopeHandlers.get(scope) === handler) {
      scopeHandlers.delete(scope);
      notify();
    }
  };
}

/** Whether `scope`'s panel is mounted and says `id` applies now. */
export function scopeCanRun(scope: string, id: string): boolean {
  return scopeHandlers.get(scope)?.canRun(id) ?? false;
}

/** Run `id` in `scope`'s panel. False when no panel is mounted or it declined. */
export function runInScope(scope: string, id: string): boolean {
  return scopeHandlers.get(scope)?.run(id) ?? false;
}

/**
 * Build a command that belongs to one panel. Its `run` and `when` go through the
 * panel's scope handler, so the palette offers it only when it applies and a
 * run from anywhere reaches the same code the panel's own key handler does.
 */
export function scopedCommand(
  def: Omit<Command, "run" | "when" | "scope"> & { scope: string },
): Command {
  const { scope, id } = def;
  return {
    ...def,
    run: () => {
      runInScope(scope, id);
    },
    when: () => scopeCanRun(scope, id),
  };
}
