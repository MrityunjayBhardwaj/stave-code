/**
 * PatternIR JSON serialization.
 *
 * Serialize PatternIR trees to/from JSON.
 * Since PatternIR is already a tagged union of plain objects, round-trip is lossless.
 *
 * The JSON envelope adds a schema version for LLM consumption and versioning.
 */

import type { PatternIR, PlayParams } from './PatternIR'

export const PATTERN_IR_SCHEMA_VERSION = '1.0'

interface PatternIREnvelope {
  $schema: string
  tree: PatternIR
}

/** Serialize a PatternIR tree to JSON. */
export function patternToJSON(ir: PatternIR, pretty?: boolean): string {
  const envelope: PatternIREnvelope = {
    $schema: `patternir/${PATTERN_IR_SCHEMA_VERSION}`,
    tree: ir,
  }
  return pretty ? JSON.stringify(envelope, null, 2) : JSON.stringify(envelope)
}

/** Deserialize a PatternIR tree from JSON. Throws on invalid input. */
export function patternFromJSON(json: string): PatternIR {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    throw new Error(`PatternIR: invalid JSON — ${String(e)}`)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('PatternIR: expected object at root')
  }

  const envelope = parsed as Record<string, unknown>
  if (!('tree' in envelope)) {
    throw new Error('PatternIR: missing "tree" field')
  }

  return validateNode(envelope.tree, 'tree')
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_TAGS = new Set([
  'Pure', 'Seq', 'Stack', 'Play', 'Sleep', 'Choice', 'Every',
  'Cycle', 'When', 'FX', 'Ramp', 'Fast', 'Slow', 'Loop', 'Code',
])

function validateNode(raw: unknown, path: string): PatternIR {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${path}: expected object, got ${typeof raw}`)
  }

  const node = raw as Record<string, unknown>

  if (typeof node.tag !== 'string') {
    throw new Error(`${path}: missing or invalid "tag" field`)
  }

  if (!VALID_TAGS.has(node.tag)) {
    throw new Error(`${path}: unknown tag "${node.tag}"`)
  }

  switch (node.tag) {
    case 'Pure':
      return { tag: 'Pure' }

    case 'Seq': {
      requireArray(node, 'children', path)
      const children = (node.children as unknown[]).map((c, i) =>
        validateNode(c, `${path}.children[${i}]`)
      )
      return { tag: 'Seq', children }
    }

    case 'Stack': {
      requireArray(node, 'tracks', path)
      const tracks = (node.tracks as unknown[]).map((t, i) =>
        validateNode(t, `${path}.tracks[${i}]`)
      )
      return { tag: 'Stack', tracks }
    }

    case 'Play': {
      requireField(node, 'note', ['string', 'number'], path)
      requireField(node, 'duration', ['number'], path)
      requireObject(node, 'params', path)
      return {
        tag: 'Play',
        note: node.note as string | number,
        duration: node.duration as number,
        params: node.params as PlayParams,
      }
    }

    case 'Sleep': {
      requireField(node, 'duration', ['number'], path)
      return { tag: 'Sleep', duration: node.duration as number }
    }

    case 'Choice': {
      requireField(node, 'p', ['number'], path)
      requireField(node, 'then', ['object'], path)
      requireField(node, 'else_', ['object'], path)
      return {
        tag: 'Choice',
        p: node.p as number,
        then: validateNode(node.then, `${path}.then`),
        else_: validateNode(node.else_, `${path}.else_`),
      }
    }

    case 'Every': {
      requireField(node, 'n', ['number'], path)
      requireField(node, 'body', ['object'], path)
      const result: Extract<PatternIR, { tag: 'Every' }> = {
        tag: 'Every',
        n: node.n as number,
        body: validateNode(node.body, `${path}.body`),
      }
      if (node.default_ !== undefined) {
        result.default_ = validateNode(node.default_, `${path}.default_`)
      }
      return result
    }

    case 'Cycle': {
      requireArray(node, 'items', path)
      const items = (node.items as unknown[]).map((item, i) =>
        validateNode(item, `${path}.items[${i}]`)
      )
      return { tag: 'Cycle', items }
    }

    case 'When': {
      requireField(node, 'gate', ['string'], path)
      requireField(node, 'body', ['object'], path)
      return {
        tag: 'When',
        gate: node.gate as string,
        body: validateNode(node.body, `${path}.body`),
      }
    }

    case 'FX': {
      requireField(node, 'name', ['string'], path)
      requireObject(node, 'params', path)
      requireField(node, 'body', ['object'], path)
      return {
        tag: 'FX',
        name: node.name as string,
        params: node.params as Record<string, number | string>,
        body: validateNode(node.body, `${path}.body`),
      }
    }

    case 'Ramp': {
      requireField(node, 'param', ['string'], path)
      requireField(node, 'from', ['number'], path)
      requireField(node, 'to', ['number'], path)
      requireField(node, 'cycles', ['number'], path)
      requireField(node, 'body', ['object'], path)
      return {
        tag: 'Ramp',
        param: node.param as string,
        from: node.from as number,
        to: node.to as number,
        cycles: node.cycles as number,
        body: validateNode(node.body, `${path}.body`),
      }
    }

    case 'Fast': {
      requireField(node, 'factor', ['number'], path)
      requireField(node, 'body', ['object'], path)
      return {
        tag: 'Fast',
        factor: node.factor as number,
        body: validateNode(node.body, `${path}.body`),
      }
    }

    case 'Slow': {
      requireField(node, 'factor', ['number'], path)
      requireField(node, 'body', ['object'], path)
      return {
        tag: 'Slow',
        factor: node.factor as number,
        body: validateNode(node.body, `${path}.body`),
      }
    }

    case 'Loop': {
      requireField(node, 'body', ['object'], path)
      return {
        tag: 'Loop',
        body: validateNode(node.body, `${path}.body`),
      }
    }

    case 'Elongate': {
      requireField(node, 'factor', ['number'], path)
      requireField(node, 'body', ['object'], path)
      return {
        tag: 'Elongate',
        factor: node.factor as number,
        body: validateNode(node.body, `${path}.body`),
      }
    }

    case 'Code': {
      requireField(node, 'code', ['string'], path)
      return { tag: 'Code', code: node.code as string, lang: 'strudel' }
    }

    default:
      throw new Error(`${path}: unhandled tag "${node.tag}"`)
  }
}

function requireField(
  node: Record<string, unknown>,
  key: string,
  types: string[],
  path: string,
): void {
  if (!(key in node)) {
    throw new Error(`${path}: missing field "${key}"`)
  }
  if (!types.includes(typeof node[key])) {
    throw new Error(
      `${path}: field "${key}" must be ${types.join(' or ')}, got ${typeof node[key]}`
    )
  }
}

function requireArray(node: Record<string, unknown>, key: string, path: string): void {
  if (!(key in node) || !Array.isArray(node[key])) {
    throw new Error(`${path}: field "${key}" must be an array`)
  }
}

function requireObject(node: Record<string, unknown>, key: string, path: string): void {
  if (!(key in node) || typeof node[key] !== 'object' || node[key] === null || Array.isArray(node[key])) {
    throw new Error(`${path}: field "${key}" must be an object`)
  }
}
