import { newId } from './board';
import { orthonormalize } from './geometry';
import type { Board, Constraint, DisplayUnit, FeatureRef, Vec3 } from './types';
import { FEATURE_NAMES } from './types';

/**
 * Serialisation.
 *
 * A project and an assembly are the same shape — boards plus the constraints
 * among them — so one serialiser, one validator and one id-remapper serve both
 * saving a file and stamping a saved assembly into an existing model. That is
 * why `extractSubgraph` and `remapIds` live here rather than in a future
 * assembly module: the assembly feature is mostly UI on top of this.
 */

export const SCHEMA_VERSION = 1;

export interface SerializedProject {
  schemaVersion: number;
  name: string;
  units: DisplayUnit;
  boards: Board[];
  constraints: Constraint[];
}

export interface ProjectSnapshot {
  name: string;
  units: DisplayUnit;
  boards: readonly Board[];
  constraints: readonly Constraint[];
}

export function serializeProject(snapshot: ProjectSnapshot): SerializedProject {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: snapshot.name,
    units: snapshot.units,
    boards: snapshot.boards.map((board) => ({ ...board })),
    constraints: snapshot.constraints.map((constraint) => ({ ...constraint })),
  };
}

export function projectToJson(snapshot: ProjectSnapshot): string {
  return JSON.stringify(serializeProject(snapshot), null, 2);
}

export class ProjectParseError extends Error {}

function asVec3(value: unknown, fallback: Vec3): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  const [a, b, c] = value;
  if (typeof a !== 'number' || typeof b !== 'number' || typeof c !== 'number') return fallback;
  return [a, b, c];
}

function parseBoard(raw: unknown): Board | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const id = typeof record.id === 'string' ? record.id : null;
  const length = typeof record.length === 'number' ? record.length : null;
  const section = record.section as Record<string, unknown> | undefined;
  if (!id || length === null || !section) return null;

  const width = typeof section.width === 'number' ? section.width : null;
  const thickness = typeof section.thickness === 'number' ? section.thickness : null;
  if (width === null || thickness === null) return null;

  const position = asVec3(record.position, [0, 0, 0]);
  const orientationRaw = Array.isArray(record.orientation) ? record.orientation : [];
  const orientation = orthonormalize([
    asVec3(orientationRaw[0], [1, 0, 0]),
    asVec3(orientationRaw[1], [0, 1, 0]),
    asVec3(orientationRaw[2], [0, 0, 1]),
  ]);

  const board: Board = {
    id,
    label: typeof record.label === 'string' ? record.label : id,
    section: { width, thickness },
    length,
    position,
    freePosition: asVec3(record.freePosition, position),
    orientation,
    pinned: record.pinned === true,
  };
  if (typeof record.nominal === 'string') board.nominal = record.nominal;
  if (typeof record.groupId === 'string') board.groupId = record.groupId;
  return board;
}

function parseFeatureRef(raw: unknown): FeatureRef | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  if (record.kind === 'ground') return { kind: 'ground' };
  if (record.kind !== 'board' || typeof record.boardId !== 'string') return null;

  const feature = FEATURE_NAMES.find((name) => name === record.feature);
  if (!feature) return null;
  return { kind: 'board', boardId: record.boardId, feature };
}

function parseConstraint(raw: unknown): Constraint | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const id = typeof record.id === 'string' ? record.id : null;
  const kind = record.kind === 'flush' || record.kind === 'mate' ? record.kind : null;
  const a = parseFeatureRef(record.a);
  const b = parseFeatureRef(record.b);
  if (!id || !kind || !a || !b) return null;

  return {
    id,
    kind,
    a,
    b,
    offset: typeof record.offset === 'number' ? record.offset : 0,
    enabled: record.enabled !== false,
  };
}

/**
 * Parse a saved file. Malformed boards and constraints are dropped rather than
 * failing the whole load — recovering most of a project beats recovering none
 * of it — but a file that is not a project at all is rejected outright.
 */
export function parseProject(json: string): SerializedProject {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ProjectParseError('That file is not valid JSON.');
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new ProjectParseError('That file does not contain a project.');
  }

  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.boards)) {
    throw new ProjectParseError('That file does not contain a board list.');
  }

  const version = typeof record.schemaVersion === 'number' ? record.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new ProjectParseError(
      `This file was saved by a newer version of the app (format ${version}).`,
    );
  }

  const boards = record.boards.map(parseBoard).filter((b): b is Board => b !== null);
  const constraintsRaw = Array.isArray(record.constraints) ? record.constraints : [];
  const known = new Set(boards.map((board) => board.id));

  const constraints = constraintsRaw
    .map(parseConstraint)
    .filter((c): c is Constraint => c !== null)
    // Drop constraints whose boards did not survive parsing.
    .filter(
      (c) =>
        (c.a.kind === 'ground' || known.has(c.a.boardId)) &&
        (c.b.kind === 'ground' || known.has(c.b.boardId)),
    );

  return {
    schemaVersion: SCHEMA_VERSION,
    name: typeof record.name === 'string' ? record.name : 'Untitled frame',
    units: record.units === 'metric' ? 'metric' : 'imperial',
    boards,
    constraints,
  };
}

/**
 * Pull a set of boards and the constraints purely among them out of a model.
 * Constraints reaching outside the selection are returned separately so the
 * caller can tell the user what will be lost instead of dropping it quietly.
 */
export function extractSubgraph(
  boards: readonly Board[],
  constraints: readonly Constraint[],
  selection: ReadonlySet<string>,
): { boards: Board[]; constraints: Constraint[]; dropped: Constraint[] } {
  const kept = boards.filter((board) => selection.has(board.id));
  const inside = (ref: FeatureRef): boolean =>
    ref.kind === 'ground' ? false : selection.has(ref.boardId);

  const internal: Constraint[] = [];
  const dropped: Constraint[] = [];

  for (const constraint of constraints) {
    const touches = inside(constraint.a) || inside(constraint.b);
    if (!touches) continue;
    if (inside(constraint.a) && inside(constraint.b)) internal.push(constraint);
    else dropped.push(constraint);
  }

  return { boards: kept, constraints: internal, dropped };
}

/**
 * Clone boards and constraints under fresh ids, keeping internal references
 * consistent. Used when inserting a saved assembly into a model that may
 * already contain a copy of it.
 */
export function remapIds(
  boards: readonly Board[],
  constraints: readonly Constraint[],
  groupId?: string,
): { boards: Board[]; constraints: Constraint[] } {
  const idMap = new Map<string, string>();
  for (const board of boards) idMap.set(board.id, newId('bd'));

  const remappedBoards = boards.map((board) => {
    const next: Board = { ...board, id: idMap.get(board.id) ?? newId('bd') };
    if (groupId !== undefined) next.groupId = groupId;
    return next;
  });

  const remapRef = (ref: FeatureRef): FeatureRef =>
    ref.kind === 'ground' ? ref : { ...ref, boardId: idMap.get(ref.boardId) ?? ref.boardId };

  const remappedConstraints = constraints.map((constraint) => ({
    ...constraint,
    id: newId('c'),
    a: remapRef(constraint.a),
    b: remapRef(constraint.b),
  }));

  return { boards: remappedBoards, constraints: remappedConstraints };
}
