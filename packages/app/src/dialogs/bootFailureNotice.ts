/**
 * bootFailureNotice.ts — tell the user, once, that the audio engine did not start.
 *
 * WHY A DIALOG AND NOT A TOAST (#1218). #1215 made a stalled boot step fail in
 * three seconds instead of hanging forever, and #1218 then measured the part
 * that bounding cannot buy: a stalled module import is unrecoverable for the
 * life of the document, because the module registry hands back the same dead
 * pending request and issues no second fetch. Evaluating again re-enters `init`
 * and cannot succeed. So the only thing that recovers is a reload, and the user
 * is the only one who can decide to do it.
 *
 * Every toast in `./host` expires on a timer. A toast here would vanish and
 * leave an app that looks healthy and cannot make a sound — the same silent
 * dead state as #1214 and #1193, wearing a friendlier face. A dialog is
 * proportionate because the failure is not partial: audio is gone, which is
 * most of what this application is for.
 *
 * WHAT RAISES IT: any REQUIRED boot step (a module import, `evalScope`,
 * `initAudio`) — not the optional ones. Optional steps degrade by design; the
 * user loses a sample bank and keeps a working engine, and saying so would be
 * noise. The distinction is the engine's own, read off the branded error rather
 * than re-derived from its message.
 */
import { isBootStepFailure } from "@stave/editor";
import { closeDialog, getDialog, showConfirm } from "./host";

/**
 * Once per document, deliberately.
 *
 * The same failure arrives from several directions — the idle warm-up, then
 * every Play, then every re-evaluation — because `init()` clears its memo on
 * rejection and each caller genuinely retries. Without this the user would be
 * re-prompted on every attempt, which is how a warning becomes something to
 * dismiss without reading.
 */
let raised = false;

/** Test seam: forget that the notice was shown. Not called by production code. */
export function resetBootFailureNotice(): void {
  raised = false;
}

/** How the step is described to someone who is not going to read the console. */
function describe(step: string, deadlineMs: number): string {
  if (deadlineMs <= 0) {
    return `“${step}” was never attempted — the rest of start-up had already used the time budget.`;
  }
  const seconds = Math.round(deadlineMs / 100) / 10;
  return `Loading “${step}” timed out after ${seconds}s.`;
}

/**
 * If `err` is a required-boot-step failure, tell the user and offer a reload.
 *
 * Returns whether this WAS such a failure, so a caller can keep its existing
 * behaviour for everything else — the point is to add a surface for one class
 * of error, never to swallow the rest.
 *
 * `reload` is injected so a test can observe the choice without navigating; in
 * production it is the page reload the dialog promises.
 */
export function reportBootFailure(
  err: unknown,
  reload: () => void = () => window.location.reload(),
): boolean {
  if (!isBootStepFailure(err)) return false;
  if (raised) return true;
  raised = true;

  // ⚠ SETTLE WHATEVER IS OPEN FIRST. `dialog` is a single slot and assigning a
  // new one drops the old, so a boot failure landing while (say) a rename
  // prompt is open would leave that prompt's promise pending forever — a
  // caller awaiting an answer that can no longer arrive, which is precisely
  // the never-settling-promise shape #1193 turned out to be. `closeDialog`
  // resolves it with a cancel value first.
  if (getDialog()) closeDialog();

  void showConfirm({
    title: "The audio engine didn't start.",
    description:
      `${describe(err.bootStep, err.bootStepDeadlineMs)} ` +
      `A reload is needed to try again — a stalled load can't be retried in place.`,
    confirmLabel: "Reload",
    cancelLabel: "Continue without audio",
  }).then((confirmed) => {
    if (confirmed) reload();
  });

  return true;
}
