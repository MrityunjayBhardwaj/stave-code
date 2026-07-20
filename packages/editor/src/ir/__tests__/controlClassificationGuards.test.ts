/**
 * controlClassificationGuards.test.ts — the control-classification behaviours
 * that NO metric can see.
 *
 * The FX→Param collapse moves ~54 corpus nodes off the `FX` tag. Tag counts and
 * parity snapshots will move loudly and review well. This file exists for the
 * behaviours that sit in the blind spots BEHIND those counts — where a
 * regression produces no count movement, no snapshot churn, no thrown error,
 * and no failing gate.
 *
 * Three independent reasons a blind spot exists here:
 *
 *   1. ZERO CORPUS OCCURRENCES. `reverb` and `hpf` appear nowhere in the 57
 *      corpus files, so no count can ever observe them regressing.
 *   2. THE METRIC IS THE WRONG SHAPE. `extractTransform` emits a transform
 *      arrow; a change there alters the emitted STRING while leaving every tag
 *      count identical. Counting nodes cannot see a change in how a node is
 *      spelled.
 *   3. SEMANTICS DO NOT MOVE EITHER. The degraded arrow form is hap-equivalent
 *      to the idiomatic one (pinned below with the eval oracle), so even a
 *      behavioural test would stay green. Only the emitted string shows it.
 *
 * So the assertions here are deliberately on the EMITTED STRING and the
 * COLLECTED EVENT PARAMS, not on tags. Each pin says whether the collapse is
 * expected to PRESERVE it or deliberately FLIP it — a pin whose intent is
 * unstated is just a tripwire, and the next person deletes it.
 *
 * Everything asserted here was verified against unmodified `f6c5049f` before
 * being written down. Nothing here is transcribed from a design document.
 *
 * See #955 (this suite) · #944 (the collapse) · #929 (adapter consolidation).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { evalScope, evaluate } from '@strudel/core/evaluate.mjs'
import * as strudelCore from '@strudel/core'
import { mini, miniAllStrings } from '@strudel/mini/mini.mjs'
import { isControlName } from '@strudel/core/controls.mjs'
import type { PatternIR } from '../PatternIR'
import { parseStrudel } from '../parseStrudel'
import { toStrudel } from '../toStrudel'
import { collectCycles } from './helpers/collectCycles'

/* eslint-disable @typescript-eslint/no-explicit-any */

// One-time Strudel scope boot — same shape as parity.test.ts. Needed only by
// the hap-equivalence pin; the string pins are pure.
beforeAll(async () => {
  await evalScope(Promise.resolve(strudelCore), Promise.resolve({ mini }))
  miniAllStrings()
})

/** Every node in the tree, depth-first. Walks the sub-IR carriers by name so a
 *  Stack's `tracks` and a Seq's `children` are both reached. */
function walk(node: unknown, out: PatternIR[] = []): PatternIR[] {
  if (!node || typeof node !== 'object') return out
  const n = node as any
  if (typeof n.tag === 'string') out.push(n)
  for (const key of ['body', 'tracks', 'children', 'items', 'default_', 'transform', 'lookup', 'selector']) {
    const v = n[key]
    if (Array.isArray(v)) v.forEach((c) => walk(c, out))
    else if (v) walk(v, out)
  }
  return out
}

const nodesWithTag = (src: string, tag: string): any[] =>
  walk(parseStrudel(src)).filter((n) => n.tag === tag)

const emit = (src: string): string => toStrudel(parseStrudel(src) as never)

/** Collected params for the first event of cycle 0. The consumer-facing view:
 *  what a downstream reader actually finds on the event. */
const firstEventParams = (src: string): Record<string, unknown> => {
  const evs = collectCycles(parseStrudel(src) as never, 0, 1) as any[]
  expect(evs.length).toBeGreaterThan(0)
  return evs[0].params
}

/** Haps as comparable strings, 4 cycles — the second oracle. Asks Strudel what
 *  it actually triggers rather than trusting our own re-parse. */
async function haps(code: string, cycles = 4): Promise<string[]> {
  const evaluated = await evaluate(code)
  const out: string[] = []
  for (let c = 0; c < cycles; c++) {
    for (const h of (evaluated.pattern as any).queryArc(c, c + 1)) {
      out.push(`${h.whole?.begin?.valueOf?.() ?? '?'}:${JSON.stringify(h.value)}`)
    }
  }
  return out.sort()
}

// ---------------------------------------------------------------------------
// 1. extractTransform — the FX-only privileged path (toStrudel.ts:347)
// ---------------------------------------------------------------------------
describe('extractTransform: FX is the exception, not the rule', () => {
  // COLLAPSE WILL FLIP THIS. `x => x.room(0.8)` is reachable ONLY because a
  // numeric-arg control still tags FX. Once room/delay/lpf become Param, this
  // branch has no real users left and the emission becomes the `() =>` form
  // below. That flip is EXPECTED and correct-to-make; it must be DECLARED.
  it('an FX body emits the idiomatic single-argument arrow', () => {
    expect(emit('s("bd hh").every(4, x => x.room(0.8))'))
      .toBe('s("bd hh").every(4, x => x.room(0.8))')
  })

  // COLLAPSE PRESERVES THESE. They already take the generic fallback today —
  // which is the point: the degraded form is the MAJORITY behaviour, covering
  // all 18 transform-arrow bodies in the corpus (add 12, speed 5, rev 1, ply 1).
  // The fallback emits a ZERO-ARGUMENT arrow that inlines a duplicate copy of
  // the receiver. It discards its input entirely.
  it.each([
    // arg shape → tag, all four already degraded on f6c5049f
    ['s("bd hh").every(4, x => x.speed(2))',  's("bd hh").every(4, () => s("bd hh").speed(2))',  'Param'],
    ['s("bd hh").every(4, x => x.add(12))',   's("bd hh").every(4, () => s("bd hh").add(12))',   'Code'],
    ['s("bd hh").every(4, x => x.rev())',     's("bd hh").every(4, () => s("bd hh").rev())',     'Code'],
    ['s("bd hh").every(4, x => x.ply(2))',    's("bd hh").every(4, () => s("bd hh").ply(2))',    'Ply'],
  ])('a non-FX body (%s) degrades to a 0-arg arrow duplicating the receiver', (src, expected) => {
    expect(emit(src)).toBe(expected)
  })

  // The #935 path: a PATTERN arg on a curated control already tags Param, so a
  // control that emits the idiomatic form with a number emits the degraded form
  // with a pattern. Same control, same position — two spellings, decided purely
  // by arg shape. This is the defect the collapse resolves by making BOTH take
  // the same path.
  it('one control emits two different arrow forms depending on arg shape', () => {
    expect(emit('s("bd hh").every(4, x => x.room(0.8))'))
      .toBe('s("bd hh").every(4, x => x.room(0.8))')
    expect(emit('s("bd hh").every(4, x => x.room("0.3 0.5"))'))
      .toBe('s("bd hh").every(4, () => s("bd hh").room("0.3 0.5"))')
  })

  // The duplication is not cosmetic — it scales with the receiver. An upstream
  // chain is copied wholesale into the arrow body.
  it('the duplicated receiver carries the whole upstream chain', () => {
    expect(emit('s("bd hh").fast(2).every(4, x => x.room("0.3 0.5"))'))
      .toBe('s("bd hh").fast(2).every(4, () => s("bd hh").fast(2).room("0.3 0.5"))')
  })
})

// ---------------------------------------------------------------------------
// 2. The degraded arrow is hap-equivalent — why no behavioural test catches it
// ---------------------------------------------------------------------------
describe('the degraded arrow plays identically (so only the string shows it)', () => {
  // This pin is the REASON the string assertions above must exist. The 0-arg
  // arrow ignores its argument and rebuilds the receiver — and the receiver is
  // exactly what it rebuilds, so the music is unchanged. Stating this stops the
  // defect being over-claimed as "broken code": it is a FIDELITY defect, not a
  // correctness one.
  //
  // COLLAPSE MUST PRESERVE THIS. If a later change makes these diverge, the
  // duplication has turned into wrong music and this test is the alarm.
  it.each([
    's("bd hh").every(4, x => x.room("0.3 0.5"))',
    's("bd hh").every(4, x => x.lpf("400 800"))',
    's("bd hh").fast(2).every(4, x => x.room("0.3 0.5"))',
  ])('%s round-trips to hap-identical code', async (src) => {
    const out = emit(src)
    expect(out).not.toBe(src)          // it really did degrade
    expect(await haps(out)).toEqual(await haps(src))
  })
})

// ---------------------------------------------------------------------------
// 3. reverb / hpf — zero corpus occurrences, therefore metric-invisible
// ---------------------------------------------------------------------------
describe('controls the corpus cannot see', () => {
  // The registry itself is the authority for WHY reverb must stay curated.
  // Asserting `isControlName` rather than a transcribed list means this pin
  // re-derives from Strudel on every run and cannot go stale.
  it('reverb is not a core control, hence cannot migrate to the registry path', () => {
    expect(isControlName('reverb')).toBe(false)
    expect(isControlName('room')).toBe(true)
  })

  // COLLAPSE MUST PRESERVE. A wholesale delete of the curated arms regresses
  // this from classified to opaque, and no count would ever show it.
  it('reverb with a numeric arg classifies today', () => {
    expect(nodesWithTag('s("bd").reverb(0.5)', 'FX')).toHaveLength(1)
    expect(firstEventParams('s("bd").reverb(0.5)')).toMatchObject({ reverb: 0.5 })
  })

  // Faithful to TODAY, and deliberately so: reverb is not in the registry, so
  // the #935 pattern-arg rescue does not apply and it opaques. Pinned as the
  // asymmetry it is — NOT as an endorsement.
  it('reverb with a pattern arg opaques, unlike every registry control', () => {
    expect(nodesWithTag('s("bd").reverb("0.3 0.5")', 'Code')).not.toHaveLength(0)
    expect(nodesWithTag('s("bd").reverb("0.3 0.5")', 'FX')).toHaveLength(0)
  })

  it('hpf classifies in both arg shapes though the corpus contains none', () => {
    expect(nodesWithTag('s("bd").hpf(400)', 'FX')).toHaveLength(1)
    expect(nodesWithTag('s("bd").hpf("200 400")', 'Param')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 4. One control, two param keys — the defect at the consumer-facing level
// ---------------------------------------------------------------------------
describe('the same control files under different keys by arg shape', () => {
  // The sharpest statement of what the collapse fixes. Tag counts show a node
  // moving between tags; THIS shows a downstream reader of `params.lpf` finding
  // nothing when the user wrote a pattern. The canonical key (`cutoff`) is the
  // one #928 established, so the pattern arm is already correct and the NUMERIC
  // arm is the one out of step.
  //
  // COLLAPSE WILL FLIP THE NUMERIC ROW: after it, both spellings should file
  // under the canonical key. That is the whole point — declare it here.
  it('lpf: numeric files under lpf, pattern files under the canonical cutoff', () => {
    expect(firstEventParams('s("bd").lpf(800)')).toMatchObject({ lpf: 800 })
    expect(firstEventParams('s("bd").lpf("400 800")')).toMatchObject({ cutoff: '400' })
  })

  it('hpf: numeric files under hpf, pattern files under the canonical hcutoff', () => {
    expect(firstEventParams('s("bd").hpf(400)')).toMatchObject({ hpf: 400 })
    expect(nodesWithTag('s("bd").hpf("200 400")', 'Param')[0].key).toBe('hcutoff')
  })

  // `userMethod` is what keeps the round-trip byte-identical while the key is
  // canonicalised. If this drifts, the user's source gets rewritten under them.
  it('the user token survives canonicalisation, so source round-trips', () => {
    expect(nodesWithTag('s("bd").lpf("400 800")', 'Param')[0].userMethod).toBe('lpf')
    expect(emit('s("bd").lpf("400 800")')).toBe('s("bd").lpf("400 800")')
    expect(emit('s("bd").hpf("200 400")')).toBe('s("bd").hpf("200 400")')
  })
})

// ---------------------------------------------------------------------------
// 5. Stacked same-control calls — first-wins at the merge
// ---------------------------------------------------------------------------
describe('repeated control calls merge first-wins', () => {
  // Two nested FX nodes both survive in the tree; the merge in `collect` is
  // what picks a winner, and the INNER (first-written) one takes it.
  //
  // The collapse changes the merge path (FX carries a params Record, Param
  // carries key/value), so this is exactly the kind of behaviour that can flip
  // silently. Pinned BEFORE, so a flip has to be argued for.
  it('.room(0.3).room(0.5) collects the first value', () => {
    expect(nodesWithTag('s("bd").room(0.3).room(0.5)', 'FX')).toHaveLength(2)
    expect(firstEventParams('s("bd").room(0.3).room(0.5)')).toMatchObject({ room: 0.3 })
  })

  it('holds for a control that canonicalises, too', () => {
    expect(firstEventParams('s("bd").lpf(400).lpf(900)')).toMatchObject({ lpf: 400 })
  })
})

// ---------------------------------------------------------------------------
// 6. Synthetic jux pans — an internal marker wearing the FX tag
// ---------------------------------------------------------------------------
describe('jux pan nodes are not a control classification', () => {
  // These are the 6 nodes that SURVIVE the collapse with tag FX, and they are
  // not user-written controls at all — `jux` synthesises them to pan its two
  // arms. `userMethod === undefined` is the discriminator, and
  // `irProjection.ts:236` strips on exactly that predicate.
  //
  // COLLAPSE PRESERVES. Rehoming them off the FX tag is a SEPARATE change
  // (the tag deletion), and this pin is what makes that change safe to attempt.
  it('jux synthesises one pan FX node per arm, neither with a userMethod', () => {
    const pans = nodesWithTag('s("bd hh").jux(x => x.rev())', 'FX')
    expect(pans).toHaveLength(2)                        // one per stacked arm
    expect(pans.map((p) => p.params.pan).sort()).toEqual([-1, 1])
    for (const p of pans) {
      expect(p.name).toBe('pan')
      expect(p.userMethod).toBeUndefined()              // the strip predicate
    }
  })

  // The contrast that gives the discriminator its meaning — and it is sharper
  // than `userMethod` alone. `pan` is NOT one of the curated arms, so a
  // user-written `.pan(0.5)` already takes the registry path and tags Param.
  // User pan and synthetic pan are therefore already on DIFFERENT TAGS today.
  //
  // This is what makes the eventual tag deletion tractable: once the collapse
  // empties FX of real controls, `FX` denotes ONLY jux's internal marker — it
  // stops being a classification and becomes a private flag, which is the
  // honest thing to rename it to.
  it('a user-written pan is not FX at all — it takes the registry path', () => {
    expect(nodesWithTag('s("bd").pan(0.5)', 'FX')).toHaveLength(0)
    const [userPan] = nodesWithTag('s("bd").pan(0.5)', 'Param')
    expect(userPan.key).toBe('pan')
    expect(userPan.userMethod).toBe('pan')
  })
})
