import { dot, EPSILON, refGeometry } from '../geometry';
import type { Board, Constraint, Vec3 } from '../types';
import { GROUND_ID, refId } from '../types';

/**
 * Turning constraints into equations.
 *
 * Every constraint says "these two planes are coincident". Because the user
 * sets orientation explicitly and the solver never rotates anything, that
 * collapses to a single scalar equation along the shared normal:
 *
 *     tA - tB = s * hB - hA + offset          t = normal . position
 *
 * where `s` is +1 when the two picked normals agree (flush) and -1 when they
 * oppose (mate), and `h` is the centroid-to-surface distance.
 *
 * Constraints sharing a normal direction never interact with constraints along
 * any other direction, so they are bucketed into independent one-dimensional
 * systems — "families" — keyed by normal. Opposite normals belong to the same
 * family, with a sign carried on the equation.
 */

/** Tolerance for deciding two normals point the same way. Loose: ~0.008°. */
const NORMAL_KEY_PRECISION = 1e4;

/**
 * Flip a normal so that `n` and `-n` produce the same representative. The
 * dominant component is forced positive; ties break on axis order so the result
 * is deterministic across runs and reloads.
 */
export function canonicalNormal(n: Vec3): Vec3 {
  let dominant = 0;
  let best = Math.abs(n[0]);
  for (let i = 1; i < 3; i++) {
    const magnitude = Math.abs(n[i] ?? 0);
    if (magnitude > best + EPSILON) {
      best = magnitude;
      dominant = i;
    }
  }
  return (n[dominant] ?? 0) < 0 ? [-n[0], -n[1], -n[2]] : [n[0], n[1], n[2]];
}

export function familyKey(n: Vec3): string {
  const c = canonicalNormal(n);
  const q = (v: number): number => Math.round(v * NORMAL_KEY_PRECISION) / NORMAL_KEY_PRECISION;
  // `+ 0` normalises -0 to 0 so mirrored normals don't produce distinct keys.
  return `${q(c[0]) + 0},${q(c[1]) + 0},${q(c[2]) + 0}`;
}

/** One equation: `uA - uB = c`, where u is the position projected on the family normal. */
export interface Edge {
  constraintId: string;
  a: string;
  b: string;
  c: number;
}

export interface Family {
  key: string;
  normal: Vec3;
  edges: Edge[];
}

export type InvalidReason = 'missing-board' | 'not-parallel' | 'wrong-kind' | 'self-reference';

export interface BuildResult {
  families: Map<string, Family>;
  invalid: Map<string, InvalidReason>;
}

export const INVALID_MESSAGES: Record<InvalidReason, string> = {
  'missing-board': 'References a board that no longer exists.',
  'not-parallel':
    'These surfaces are not parallel. Rotate the board so they face along the same axis first.',
  'wrong-kind':
    'These surfaces face the same way, so they can be flush but cannot mate (or vice versa).',
  'self-reference': 'A board cannot be constrained to itself.',
};

export function buildFamilies(
  boards: ReadonlyMap<string, Board>,
  constraints: readonly Constraint[],
): BuildResult {
  const families = new Map<string, Family>();
  const invalid = new Map<string, InvalidReason>();

  for (const constraint of constraints) {
    if (!constraint.enabled) continue;

    const aId = refId(constraint.a);
    const bId = refId(constraint.b);
    if (aId === bId) {
      invalid.set(constraint.id, 'self-reference');
      continue;
    }

    const ga = refGeometry(constraint.a, boards);
    const gb = refGeometry(constraint.b, boards);
    if (!ga || !gb) {
      invalid.set(constraint.id, 'missing-board');
      continue;
    }

    const alignment = dot(ga.normal, gb.normal);
    if (Math.abs(alignment) < 1 - 1e-4) {
      invalid.set(constraint.id, 'not-parallel');
      continue;
    }

    const s = alignment > 0 ? 1 : -1;
    const expectedKind = s > 0 ? 'flush' : 'mate';
    if (constraint.kind !== expectedKind) {
      invalid.set(constraint.id, 'wrong-kind');
      continue;
    }

    // Re-express the equation on the family's canonical normal, which may be
    // the reverse of A's normal; `sf` carries that flip onto the constant.
    const key = familyKey(ga.normal);
    const normal = canonicalNormal(ga.normal);
    const sf = dot(ga.normal, normal) > 0 ? 1 : -1;
    const c = sf * (s * gb.halfExtent - ga.halfExtent + constraint.offset);

    let family = families.get(key);
    if (!family) {
      family = { key, normal, edges: [] };
      families.set(key, family);
    }
    family.edges.push({ constraintId: constraint.id, a: aId, b: bId, c });
  }

  return { families, invalid };
}

/** Projection of a node onto a family normal, used to seed unanchored components. */
export function seedValue(
  nodeId: string,
  normal: Vec3,
  boards: ReadonlyMap<string, Board>,
): number {
  if (nodeId === GROUND_ID) return 0;
  const board = boards.get(nodeId);
  if (!board) return 0;
  return dot(normal, board.freePosition);
}
