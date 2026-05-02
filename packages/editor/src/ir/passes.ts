/**
 * Pass<IR> — a single IR→IR transform with a stable display name.
 * Runtime-neutral: the runner does not import or know about any
 * specific IR shape (PatternIR, future Sonic Pi IR, etc.). Each
 * runtime supplies its own pass list.
 *
 * Constraints:
 *   - run() is sync.
 *   - run() is pure: no I/O, no globals, no time-dependent behavior.
 *   - run() must NOT mutate `input`. Return a new value (or the
 *     input itself for an identity pass — referential equality is
 *     allowed when the pass really doesn't change anything).
 *
 * Diagnostics (warnings, errors) are NOT part of this contract.
 * They get a separate channel later when the first pass needs them.
 */
export interface Pass<IR> {
  readonly name: string
  run(input: IR): IR
}

/**
 * runPasses — applies passes in sequence, capturing each stage's
 * output with the pass's name.
 *
 * Output convention (locked for v1):
 *   - The returned array has length === passes.length.
 *   - entry[i].name === passes[i].name
 *   - entry[i].ir === output of passes[i].run(prev)
 *     where prev = (i === 0) ? input : entry[i-1].ir
 *
 * Rationale: every entry in the array represents the IR AFTER the
 * named pass ran. There is no implicit "input" entry — if callers
 * want to surface the raw input, they wrap it in an identity pass
 * named "Parsed" (which is exactly what the v1 Strudel pass list
 * does). This keeps the shape symmetric: every entry has a name,
 * every name corresponds to a real pass that ran.
 *
 * Empty pipeline: passes.length === 0 returns []. Callers that
 * need at least one entry must include an identity pass.
 */
export function runPasses<IR>(input: IR, passes: readonly Pass<IR>[]): { name: string; ir: IR }[] {
  const out: { name: string; ir: IR }[] = []
  let cur = input
  for (const p of passes) {
    cur = p.run(cur)
    out.push({ name: p.name, ir: cur })
  }
  return out
}
