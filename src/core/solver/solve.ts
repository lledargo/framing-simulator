import { dot } from '../geometry';
import type { Board, Vec3 } from '../types';
import type { Conflict, FamilySolution } from './propagate';
import { CONFLICT_TOLERANCE } from './propagate';

/**
 * Recombining the per-family answers into positions.
 *
 * Each family hands back one number per board: where that board sits along one
 * direction. For axis-aligned framing those directions are X, Y and Z and the
 * recombination is just assignment. Rotated members break that, so the general
 * case is a small constrained least-squares: land on the required planes while
 * staying as close as possible to where the user last dragged the board.
 *
 *     minimise |p - p0|  subject to  N p = u
 *     p = p0 + N^T (N N^T)^-1 (u - N p0)
 *
 * N is at most a few rows, so the inverse is a 3x3-ish Gauss-Jordan.
 *
 * When two families are nearly parallel the Gram matrix is singular and the
 * solve is retried with a ridge term. That fallback is deliberately not the
 * default: a ridge of 1e-9 quietly biases every ordinary axis-aligned answer by
 * a part in a billion, which is enough to turn an exact 16" into 15.99999968"
 * and split a cut-list group in two.
 */

const RIDGE = 1e-9;

/** Gauss-Jordan with partial pivoting. Returns null if singular beyond rescue. */
export function solveDense(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i] ?? 0]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row]?.[col] ?? 0) > Math.abs(m[pivot]?.[col] ?? 0)) pivot = row;
    }

    const pivotRow = m[pivot];
    const targetRow = m[col];
    if (!pivotRow || !targetRow) return null;
    if (Math.abs(pivotRow[col] ?? 0) < 1e-12) return null;

    m[pivot] = targetRow;
    m[col] = pivotRow;

    const lead = m[col]?.[col] ?? 1;
    const normalised = m[col];
    if (!normalised) return null;
    for (let k = col; k <= n; k++) normalised[k] = (normalised[k] ?? 0) / lead;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const current = m[row];
      if (!current) continue;
      const factor = current[col] ?? 0;
      if (factor === 0) continue;
      for (let k = col; k <= n; k++) {
        current[k] = (current[k] ?? 0) - factor * (normalised[k] ?? 0);
      }
    }
  }

  return m.map((row) => row[n] ?? 0);
}

export interface BoardConstraintRow {
  normal: Vec3;
  target: number;
  familyKey: string;
}

/** Position a single board given the planes it must lie on. */
export function solveBoardPosition(freePosition: Vec3, rows: readonly BoardConstraintRow[]): Vec3 {
  if (rows.length === 0) return freePosition;

  const k = rows.length;
  const residuals = rows.map((row) => row.target - dot(row.normal, freePosition));

  const gram = (ridge: number): number[][] => {
    const matrix: number[][] = [];
    for (let i = 0; i < k; i++) {
      const row: number[] = [];
      const ni = rows[i]?.normal ?? ([0, 0, 0] as Vec3);
      for (let j = 0; j < k; j++) {
        const nj = rows[j]?.normal ?? ([0, 0, 0] as Vec3);
        row.push(dot(ni, nj) + (i === j ? ridge : 0));
      }
      matrix.push(row);
    }
    return matrix;
  };

  // Exact first; the ridge is only for genuinely degenerate rows.
  const lambda = solveDense(gram(0), residuals) ?? solveDense(gram(RIDGE), residuals);
  if (!lambda) return freePosition;

  let result: Vec3 = freePosition;
  for (let i = 0; i < k; i++) {
    const n = rows[i]?.normal ?? ([0, 0, 0] as Vec3);
    const weight = lambda[i] ?? 0;
    result = [
      result[0] + n[0] * weight,
      result[1] + n[1] * weight,
      result[2] + n[2] * weight,
    ];
  }
  return result;
}

export interface SolvePositionsResult {
  positions: Map<string, Vec3>;
  /** Conflicts found while recombining families, keyed by constraint id. */
  conflicts: Map<string, Conflict>;
}

export function solvePositions(
  boards: ReadonlyMap<string, Board>,
  solutions: ReadonlyMap<string, FamilySolution>,
): SolvePositionsResult {
  const rowsByBoard = new Map<string, BoardConstraintRow[]>();

  for (const solution of solutions.values()) {
    for (const [nodeId, target] of solution.values) {
      if (!boards.has(nodeId)) continue;
      const row: BoardConstraintRow = {
        normal: solution.normal,
        target,
        familyKey: solution.key,
      };
      const existing = rowsByBoard.get(nodeId);
      if (existing) existing.push(row);
      else rowsByBoard.set(nodeId, [row]);
    }
  }

  const positions = new Map<string, Vec3>();
  const conflicts = new Map<string, Conflict>();

  for (const board of boards.values()) {
    const rows = rowsByBoard.get(board.id) ?? [];

    if (board.pinned) {
      // A pinned board defines its own position; the solver reports rather than
      // relocates, so any constraint pulling it elsewhere is a conflict.
      positions.set(board.id, board.freePosition);
      flagUnmetRows(board, board.freePosition, rows, solutions, conflicts);
      continue;
    }

    const position = solveBoardPosition(board.freePosition, rows);
    positions.set(board.id, position);
    flagUnmetRows(board, position, rows, solutions, conflicts);
  }

  return { positions, conflicts };
}

/**
 * A board asked to satisfy more independent directions than three-dimensional
 * space allows lands on a compromise. Report the constraints responsible
 * instead of letting the board drift silently.
 */
function flagUnmetRows(
  board: Board,
  position: Vec3,
  rows: readonly BoardConstraintRow[],
  solutions: ReadonlyMap<string, FamilySolution>,
  conflicts: Map<string, Conflict>,
): void {
  for (const row of rows) {
    const residual = Math.abs(dot(row.normal, position) - row.target);
    if (residual <= CONFLICT_TOLERANCE) continue;

    const incident = solutions.get(row.familyKey)?.incident.get(board.id);
    for (const constraintId of incident ?? []) {
      const previous = conflicts.get(constraintId);
      if (!previous || previous.residual < residual) {
        conflicts.set(constraintId, { constraintId, residual });
      }
    }
  }
}
