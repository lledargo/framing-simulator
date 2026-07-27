import type { Board } from '../types';
import { GROUND_ID } from '../types';
import type { Edge, Family } from './families';
import { seedValue } from './families';

/**
 * Solving one family.
 *
 * A family is a set of difference constraints `uA - uB = c` over scalars. That
 * is a graph problem, not a numerical one: fix any node in a connected
 * component and every other node follows by walking edges. So this is a
 * breadth-first traversal, exact, with no iteration and no convergence to worry
 * about.
 *
 * An edge that reaches an already-valued node is a cycle. A consistent cycle
 * (a rectangle of four boards, say) agrees to within rounding and is fine. An
 * inconsistent one means the user asked for two incompatible things, and the
 * honest response is to say so and leave the model where the first path put it,
 * rather than quietly splitting the difference and moving a board somewhere
 * nobody asked for.
 */

/** Cycles closing within this many mm are treated as consistent. */
export const CONFLICT_TOLERANCE = 1e-4;

export interface Conflict {
  constraintId: string;
  /** How far apart the two paths through the model disagree, in mm. */
  residual: number;
}

export interface FamilySolution {
  key: string;
  normal: Family['normal'];
  values: Map<string, number>;
  /** Constraint ids incident to each node, for attributing cross-family errors. */
  incident: Map<string, Set<string>>;
}

export interface PropagateResult {
  solutions: Map<string, FamilySolution>;
  conflicts: Map<string, Conflict>;
}

interface Adjacency {
  to: string;
  /** value(to) = value(from) + delta */
  delta: number;
  constraintId: string;
}

function buildAdjacency(edges: readonly Edge[]): Map<string, Adjacency[]> {
  const adjacency = new Map<string, Adjacency[]>();
  const push = (from: string, entry: Adjacency): void => {
    const list = adjacency.get(from);
    if (list) list.push(entry);
    else adjacency.set(from, [entry]);
  };

  for (const edge of edges) {
    // uA - uB = c  =>  uA = uB + c  and  uB = uA - c
    push(edge.b, { to: edge.a, delta: edge.c, constraintId: edge.constraintId });
    push(edge.a, { to: edge.b, delta: -edge.c, constraintId: edge.constraintId });
  }
  return adjacency;
}

/**
 * Order nodes by how good a root they make.
 *
 * A component with no pinned board and no ground still has to be measured from
 * somewhere, and whichever node is chosen keeps its current position while the
 * rest move to meet it. Choosing by id would be stable but arbitrary — adding
 * one constraint could teleport a finished wall across the model.
 *
 * Constraints are directional: `a` is the surface being positioned, `b` the one
 * it is positioned against. So a node that is only ever a `b` is the thing
 * everything else hangs off, and it is the one the user expects to stay put.
 */
function rootOrder(edges: readonly Edge[], boards: ReadonlyMap<string, Board>): string[] {
  const nodes = new Set<string>();
  const dependentCount = new Map<string, number>();

  for (const edge of edges) {
    nodes.add(edge.a);
    nodes.add(edge.b);
    dependentCount.set(edge.a, (dependentCount.get(edge.a) ?? 0) + 1);
  }

  const rank = (id: string): number => {
    if (isAnchored(id, boards)) return 0;
    return (dependentCount.get(id) ?? 0) === 0 ? 1 : 2;
  };

  // Id is the final tiebreak, so the result is reproducible across reloads.
  return [...nodes].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

function isAnchored(nodeId: string, boards: ReadonlyMap<string, Board>): boolean {
  if (nodeId === GROUND_ID) return true;
  return boards.get(nodeId)?.pinned ?? false;
}

export function propagateFamily(
  family: Family,
  boards: ReadonlyMap<string, Board>,
  conflicts: Map<string, Conflict>,
): FamilySolution {
  const adjacency = buildAdjacency(family.edges);
  const roots = rootOrder(family.edges, boards);
  const values = new Map<string, number>();

  const incident = new Map<string, Set<string>>();
  for (const edge of family.edges) {
    for (const node of [edge.a, edge.b]) {
      const set = incident.get(node);
      if (set) set.add(edge.constraintId);
      else incident.set(node, new Set([edge.constraintId]));
    }
  }

  for (const root of roots) {
    if (values.has(root)) continue;

    values.set(root, seedValue(root, family.normal, boards));
    const queue: string[] = [root];

    while (queue.length > 0) {
      const current = queue.shift() as string;
      const currentValue = values.get(current) ?? 0;

      for (const link of adjacency.get(current) ?? []) {
        const expected = currentValue + link.delta;
        const existing = values.get(link.to);

        if (existing === undefined) {
          values.set(link.to, expected);
          queue.push(link.to);
          continue;
        }

        const residual = Math.abs(existing - expected);
        if (residual > CONFLICT_TOLERANCE) {
          const previous = conflicts.get(link.constraintId);
          if (!previous || previous.residual < residual) {
            conflicts.set(link.constraintId, { constraintId: link.constraintId, residual });
          }
        }
      }
    }
  }

  return { key: family.key, normal: family.normal, values, incident };
}

export function propagate(
  families: ReadonlyMap<string, Family>,
  boards: ReadonlyMap<string, Board>,
): PropagateResult {
  const solutions = new Map<string, FamilySolution>();
  const conflicts = new Map<string, Conflict>();

  for (const [key, family] of families) {
    solutions.set(key, propagateFamily(family, boards, conflicts));
  }

  return { solutions, conflicts };
}
