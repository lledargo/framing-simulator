import { IDENTITY_BASIS, orthonormalize } from './geometry';
import type { LumberPreset } from './lumber';
import type { Basis, Board, Constraint, ConstraintKind, FeatureRef, Section, Vec3 } from './types';

/** Ids are opaque strings everywhere, so entities survive copy, insert and reload. */
export function newId(prefix: string): string {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}

export interface CreateBoardOptions {
  label: string;
  section: Section;
  length: number;
  nominal?: string;
  position?: Vec3;
  orientation?: Basis;
  pinned?: boolean;
  groupId?: string;
}

export function createBoard(options: CreateBoardOptions): Board {
  const position = options.position ?? [0, 0, 0];
  const board: Board = {
    id: newId('bd'),
    label: options.label,
    section: { ...options.section },
    length: options.length,
    position,
    freePosition: position,
    orientation: orthonormalize(options.orientation ?? IDENTITY_BASIS),
    pinned: options.pinned ?? false,
  };
  // `exactOptionalPropertyTypes` means an explicit `undefined` is not the same
  // as an absent key, so optional fields are attached only when present.
  if (options.nominal !== undefined) board.nominal = options.nominal;
  if (options.groupId !== undefined) board.groupId = options.groupId;
  return board;
}

export function boardFromPreset(
  preset: LumberPreset,
  length: number,
  label: string,
  overrides: Partial<CreateBoardOptions> = {},
): Board {
  return createBoard({
    label,
    section: preset.section,
    length,
    nominal: preset.id,
    ...overrides,
  });
}

export function createConstraint(
  kind: ConstraintKind,
  a: FeatureRef,
  b: FeatureRef,
  offset = 0,
): Constraint {
  return { id: newId('c'), kind, a, b, offset, enabled: true };
}

/** Move a board by hand. Only `freePosition` is authoritative; the solver owns `position`. */
export function placeBoard(board: Board, position: Vec3): Board {
  return { ...board, freePosition: position, position };
}

/** Auto-name boards as "2x4 #3", counting only same-section pieces. */
export function nextLabel(boards: readonly Board[], nominal: string): string {
  const prefix = nominal || 'Board';
  let highest = 0;
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')} #(\\d+)$`);
  for (const board of boards) {
    const match = pattern.exec(board.label);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix} #${highest + 1}`;
}
