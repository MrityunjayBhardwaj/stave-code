/**
 * #1193 / #1221 — the one place that sequences "wait for the eval in front of
 * the snapshot, then publish the snapshot".
 *
 * WHY THIS IS A MODULE AND NOT THREE LINES IN THE CALLER. The three lines WERE
 * in the caller, and that is exactly what broke: `refreshTimelineMarks` awaited
 * `evaluateForTimeline()` and then published, with a docblock calling the
 * publish UNCONDITIONAL. It was not — a statement sequenced after an unbounded
 * await is conditional on that await returning. When the engine's evaluate hung
 * (a promise with no rejection settle path), the publish never ran, so no IR
 * ever reached the Song view: it sat reading "No song to map yet — press play."
 * about a loaded document, permanently and with nothing logged.
 *
 * The bound that fixes it lived inline in a 1800-line component, where nothing
 * could reach it: no test in the repo can make `evaluateForTimeline` hang, so
 * deleting the bound reddened nothing (#1221). Here the ordering is a unit with
 * its own arms, and the caller keeps only the parts that never had an ordering
 * bug in them — reading the refs and deciding whether an eval is wanted at all.
 */

/**
 * #1193 — how long the snapshot publish will wait for the eval-on-load in
 * front of it before going ahead without eval haps.
 *
 * BOTH BOUNDS, because a ceiling that only satisfies one is how the last one
 * had to be corrected. BELOW: the healthy case must never reach this ceiling,
 * or the ordering #977 wants (eval haps populated BEFORE the publish) would be
 * quietly dropped on working machines. What is MEASURED is the whole path a
 * spec waits on — 44 trials, page load to lanes drawn, p50 54ms and max 59ms
 * with no tail; the eval sits inside that, so it is an upper bound on the eval
 * and this ceiling is ~85x it. The often-quoted "~2.5s cold eval" is from
 * #394's docblock and was NOT re-measured here — it is not what the number
 * rests on. ABOVE: every consumer of the drawn lanes allows 10s, so publishing
 * at worst 5s in leaves a full 5s of margin rather than trading one deadline
 * for another.
 */
export const TIMELINE_EVAL_WAIT_MS = 5_000;

/**
 * Await `p`, but never longer than `ms`. Resolves either way — the caller is
 * choosing to proceed without the result, not to learn whether it arrived.
 * The underlying promise is left running; nothing here cancels it, and nothing
 * republishes when a late one lands (#1222).
 */
function raceWithDeadline(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = setTimeout(finish, ms);
    void p.then(
      () => {
        clearTimeout(timer);
        finish();
      },
      () => {
        clearTimeout(timer);
        finish();
      },
    );
  });
}

export interface BoundedEvalPublish {
  /**
   * The eval to run in front of the publish, or `null` when the caller does not
   * want one — no runtime for this file, the runtime is already playing (play()
   * keeps song patterns fresh itself), or the Song timeline is not on screen.
   * A null `evaluate` publishes immediately; it never means "skip the publish".
   */
  evaluate: (() => Promise<unknown>) | null;
  /**
   * Publish the snapshot. Called EXACTLY ONCE on each of the four paths the
   * eval can take — resolved, rejected, never settled, or not asked for. This
   * is the whole point: the snapshot carries the IR that every lane, clip and
   * section is drawn from, so it must not be held hostage by the eval in front
   * of it.
   *
   * ⚠ NOT covered, deliberately: an `evaluate` that throws SYNCHRONOUSLY
   * instead of returning a promise. The only caller hands over an `async`
   * method, which cannot take that path, so a guard for it is one whose
   * break-check cannot be written against anything real. If a non-async
   * producer is ever passed here, that stops being true and this needs a path.
   */
  publish: () => void;
  /**
   * How long to wait for `evaluate` before publishing anyway. Required rather
   * than defaulted: the production ceiling is a documented constant with two
   * bounds behind it (`TIMELINE_EVAL_WAIT_MS`), and a defaulted deadline is one
   * a caller can inherit without ever deciding it.
   */
  waitMs: number;
}

/**
 * Wait (boundedly) for the eval, then publish — the ordering #977 wants, with
 * the guarantee #1193 needed.
 *
 * A hung evaluate costs eval-backed marks. It must not cost the snapshot.
 */
export async function publishSnapshotAfterBoundedEval({
  evaluate,
  publish,
  waitMs,
}: BoundedEvalPublish): Promise<void> {
  if (evaluate) {
    await raceWithDeadline(evaluate(), waitMs);
  }
  publish();
}
