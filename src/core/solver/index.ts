import type { Board, Constraint, Vec3 } from '../types';
import { buildFamilies, INVALID_MESSAGES } from './families';
import type { InvalidReason } from './families';
import { propagate } from './propagate';
import type { Conflict } from './propagate';
import { solvePositions } from './solve';

export * from './families';
export * from './propagate';
export * from './solve';

export interface SolveResult {
  /** Solved centroid position for every board, keyed by board id. */
  positions: Map<string, Vec3>;
  /** Constraints that are well-formed but cannot all be satisfied at once. */
  conflicts: Map<string, Conflict>;
  /** Constraints that are malformed — dangling, non-parallel, wrong kind. */
  invalid: Map<string, InvalidReason>;
}

/**
 * Resolve the whole model.
 *
 * Positions only — orientation is the user's business and is never inferred.
 * The pass is linear in the number of constraints, so it runs on every edit
 * rather than behind a "recompute" button.
 */
export function solveModel(
  boards: readonly Board[],
  constraints: readonly Constraint[],
): SolveResult {
  const byId = new Map(boards.map((board) => [board.id, board] as const));

  const { families, invalid } = buildFamilies(byId, constraints);
  const { solutions, conflicts } = propagate(families, byId);
  const { positions, conflicts: recombineConflicts } = solvePositions(byId, solutions);

  for (const [id, conflict] of recombineConflicts) {
    const previous = conflicts.get(id);
    if (!previous || previous.residual < conflict.residual) conflicts.set(id, conflict);
  }

  return { positions, conflicts, invalid };
}

/** Boards with their solved positions applied, ready to render. */
export function applySolve(boards: readonly Board[], result: SolveResult): Board[] {
  return boards.map((board) => {
    const position = result.positions.get(board.id);
    return position && position !== board.position ? { ...board, position } : board;
  });
}

/** Solve and apply in one step. */
export function resolveBoards(
  boards: readonly Board[],
  constraints: readonly Constraint[],
): { boards: Board[]; result: SolveResult } {
  const result = solveModel(boards, constraints);
  return { boards: applySolve(boards, result), result };
}

export function describeInvalid(reason: InvalidReason): string {
  return INVALID_MESSAGES[reason];
}
