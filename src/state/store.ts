import { create } from 'zustand';
import { temporal } from 'zundo';
import { createBoard, createConstraint, nextLabel } from '../core/board';
import type { CreateBoardOptions } from '../core/board';
import {
  compatibleKind,
  groundFacingFeature,
  IDENTITY_BASIS,
  orientationPreset,
  refGeometry,
} from '../core/geometry';
import { defaultLength, findPreset, presetsFor } from '../core/lumber';
import { parseProject, projectToJson, remapIds } from '../core/project';
import { resolveBoards } from '../core/solver';
import type { SolveResult } from '../core/solver';
import type {
  Board,
  Constraint,
  ConstraintKind,
  DisplayUnit,
  FeatureRef,
  Vec3,
} from '../core/types';
import { boardRef, refId } from '../core/types';
import type { ControlPresetId } from '../scene/controls/inputMap';

/**
 * Application state.
 *
 * The solver is the single source of truth for board positions, so it runs
 * inside every mutation rather than in a `useEffect` downstream. That keeps a
 * rendered frame from ever showing pre-solve positions, and means undo restores
 * a consistent model rather than one that re-solves a tick later.
 */

/**
 * A board edit. Distinct from `Partial<Board>` because `exactOptionalPropertyTypes`
 * makes those two different things: this one lets a caller pass `undefined` to
 * mean "remove this field", which is how the inspector clears `nominal` when a
 * dimension is typed by hand and the board stops being a stock size.
 */
export type BoardPatch = { [K in keyof Board]?: Board[K] | undefined };

export interface PendingPick {
  ref: FeatureRef;
  /** Which constraint kinds this surface could form with the other pick. */
  kind: ConstraintKind | null;
}

export interface Settings {
  units: DisplayUnit;
  controlPreset: ControlPresetId;
  showGrid: boolean;
  autoConstrainOnSnap: boolean;
}

export type Tool = 'select' | 'constrain';

export interface AppState {
  name: string;
  boards: Board[];
  constraints: Constraint[];
  solve: SolveResult;

  selection: string[];
  hoveredBoardId: string | null;
  tool: Tool;
  /** First surface picked while the constrain tool is active. */
  pendingPick: PendingPick | null;
  settings: Settings;
  statusMessage: string | null;

  addBoardFromPreset: (presetId: string) => void;
  addBoard: (options: CreateBoardOptions) => void;
  updateBoard: (id: string, patch: BoardPatch) => void;
  moveBoard: (id: string, position: Vec3) => void;
  deleteBoards: (ids: readonly string[]) => void;
  duplicateSelection: () => void;

  setSelection: (ids: readonly string[]) => void;
  toggleSelection: (id: string) => void;
  setHovered: (id: string | null) => void;
  setTool: (tool: Tool) => void;

  pickFeature: (ref: FeatureRef) => void;
  cancelPick: () => void;
  addConstraint: (kind: ConstraintKind, a: FeatureRef, b: FeatureRef, offset?: number) => void;
  updateConstraint: (id: string, patch: Partial<Constraint>) => void;
  deleteConstraint: (id: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  setStatus: (message: string | null) => void;

  newProject: () => void;
  loadProjectJson: (json: string) => void;
  exportProjectJson: () => string;
}

const EMPTY_SOLVE: SolveResult = {
  positions: new Map(),
  conflicts: new Map(),
  invalid: new Map(),
};

/** Re-solve and hand back the slice of state that changed. */
function resolved(
  boards: readonly Board[],
  constraints: readonly Constraint[],
): { boards: Board[]; constraints: Constraint[]; solve: SolveResult } {
  const { boards: solvedBoards, result } = resolveBoards(boards, constraints);
  return { boards: solvedBoards, constraints: [...constraints], solve: result };
}

const DEFAULT_SETTINGS: Settings = {
  units: 'imperial',
  controlPreset: 'sketchup',
  showGrid: true,
  autoConstrainOnSnap: true,
};

export const useStore = create<AppState>()(
  temporal(
    (set, get) => ({
      name: 'Untitled frame',
      boards: [],
      constraints: [],
      solve: EMPTY_SOLVE,

      selection: [],
      hoveredBoardId: null,
      tool: 'select',
      pendingPick: null,
      settings: DEFAULT_SETTINGS,
      statusMessage: null,

      addBoardFromPreset: (presetId) => {
        const state = get();
        const preset = findPreset(presetId) ?? presetsFor(state.settings.units)[0];
        if (!preset) return;

        // Flat and running along X, which is how a plate sits and the most
        // common thing to add first. It also means the board's thickness is the
        // vertical dimension, so resting it on the grid is just half of that.
        const orientation = orientationPreset('plate-x')?.basis ?? IDENTITY_BASIS;

        // Stagger new boards so each one lands clear of the last instead of
        // inside it. Width is the depth axis in this orientation.
        const offset = state.boards.length * (preset.section.width + 60);
        const board = createBoard({
          label: nextLabel(state.boards, preset.id),
          section: preset.section,
          length: defaultLength(state.settings.units),
          nominal: preset.id,
          orientation,
          position: [0, preset.section.thickness / 2, offset],
        });

        set({
          ...resolved([...state.boards, board], state.constraints),
          selection: [board.id],
        });
      },

      addBoard: (options) => {
        const state = get();
        const board = createBoard(options);
        set({
          ...resolved([...state.boards, board], state.constraints),
          selection: [board.id],
        });
      },

      updateBoard: (id, patch) => {
        const state = get();
        const boards = state.boards.map((board) => {
          if (board.id !== id) return board;

          const next = { ...board, ...patch } as Board & Record<string, unknown>;
          // Spreading an explicit `undefined` leaves the key present with an
          // undefined value, which then serialises as `"nominal": undefined`
          // and fails to round-trip. Drop those keys outright.
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined) delete next[key];
          }
          return next as Board;
        });
        set(resolved(boards, state.constraints));
      },

      moveBoard: (id, position) => {
        const state = get();
        // Only `freePosition` is user-owned; the solver decides `position`.
        const boards = state.boards.map((board) =>
          board.id === id ? { ...board, freePosition: position } : board,
        );
        set(resolved(boards, state.constraints));
      },

      deleteBoards: (ids) => {
        const state = get();
        const doomed = new Set(ids);
        const boards = state.boards.filter((board) => !doomed.has(board.id));
        // Constraints referencing a deleted board go with it.
        const constraints = state.constraints.filter(
          (constraint) => !doomed.has(refId(constraint.a)) && !doomed.has(refId(constraint.b)),
        );

        set({
          ...resolved(boards, constraints),
          selection: state.selection.filter((id) => !doomed.has(id)),
          pendingPick: null,
        });
      },

      duplicateSelection: () => {
        const state = get();
        const selection = new Set(state.selection);
        if (selection.size === 0) return;

        const source = state.boards.filter((board) => selection.has(board.id));
        const internal = state.constraints.filter(
          (c) =>
            c.a.kind === 'board' &&
            c.b.kind === 'board' &&
            selection.has(c.a.boardId) &&
            selection.has(c.b.boardId),
        );

        const copy = remapIds(source, internal);
        // Nudge the copy so it is visibly a second object, not a coincident one.
        const shifted = copy.boards.map((board) => {
          const moved: Vec3 = [
            board.freePosition[0],
            board.freePosition[1],
            board.freePosition[2] + 400,
          ];
          return { ...board, position: moved, freePosition: moved };
        });

        set({
          ...resolved([...state.boards, ...shifted], [...state.constraints, ...copy.constraints]),
          selection: shifted.map((board) => board.id),
        });
      },

      setSelection: (ids) => set({ selection: [...ids] }),

      toggleSelection: (id) => {
        const { selection } = get();
        set({
          selection: selection.includes(id)
            ? selection.filter((existing) => existing !== id)
            : [...selection, id],
        });
      },

      setHovered: (id) => set({ hoveredBoardId: id }),

      setTool: (tool) => set({ tool, pendingPick: null, statusMessage: null }),

      pickFeature: (ref) => {
        const state = get();
        const byId = new Map(state.boards.map((board) => [board.id, board] as const));

        if (!state.pendingPick) {
          set({
            pendingPick: { ref, kind: null },
            statusMessage: 'Now pick the surface to constrain it to.',
          });
          return;
        }

        const first = state.pendingPick.ref;
        if (refId(first) === refId(ref)) {
          set({
            statusMessage:
              first.kind === 'ground'
                ? 'Pick a board surface to constrain to the ground.'
                : 'Pick a surface on a different board, or the ground.',
          });
          return;
        }

        // A ground pick means "rest it on the floor", so use the board's
        // downward surface even if the user clicked its top.
        const grounded = resolveGroundPick(first, ref, byId);
        if (grounded === 'not-parallel') {
          set({
            statusMessage:
              'That surface is vertical, so it cannot sit on the ground. Pick the board’s top or bottom.',
          });
          return;
        }
        const [refA, refB, restedOnGround] = grounded;

        const ga = refGeometry(refA, byId);
        const gb = refGeometry(refB, byId);
        if (!ga || !gb) {
          set({ pendingPick: null, statusMessage: 'That surface is no longer available.' });
          return;
        }

        const kind = compatibleKind(ga, gb);
        if (!kind) {
          set({
            statusMessage:
              'Those surfaces are not parallel. Rotate one of the boards, then try again.',
          });
          return;
        }

        get().addConstraint(kind, refA, refB, 0);
        set({
          pendingPick: null,
          statusMessage: restedOnGround
            ? 'Rested the board on the ground.'
            : kind === 'mate'
              ? 'Mated the two surfaces.'
              : 'Made the two surfaces flush.',
        });
      },

      cancelPick: () => set({ pendingPick: null, statusMessage: null }),

      addConstraint: (kind, a, b, offset = 0) => {
        const state = get();
        const constraint = createConstraint(kind, a, b, offset);
        set(resolved(state.boards, [...state.constraints, constraint]));
      },

      updateConstraint: (id, patch) => {
        const state = get();
        const constraints = state.constraints.map((constraint) =>
          constraint.id === id ? { ...constraint, ...patch } : constraint,
        );
        set(resolved(state.boards, constraints));
      },

      deleteConstraint: (id) => {
        const state = get();
        set(resolved(state.boards, state.constraints.filter((c) => c.id !== id)));
      },

      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } })),

      setStatus: (message) => set({ statusMessage: message }),

      newProject: () =>
        set({
          name: 'Untitled frame',
          boards: [],
          constraints: [],
          solve: EMPTY_SOLVE,
          selection: [],
          pendingPick: null,
          statusMessage: null,
        }),

      loadProjectJson: (json) => {
        const parsed = parseProject(json);
        const state = get();
        set({
          name: parsed.name,
          ...resolved(parsed.boards, parsed.constraints),
          selection: [],
          pendingPick: null,
          settings: { ...state.settings, units: parsed.units },
          statusMessage: `Loaded ${parsed.boards.length} boards.`,
        });
      },

      exportProjectJson: () => {
        const state = get();
        return projectToJson({
          name: state.name,
          units: state.settings.units,
          boards: state.boards,
          constraints: state.constraints,
        });
      },
    }),
    {
      limit: 100,
      // Undo covers the model, not the camera, the current tool, or which
      // board happens to be hovered.
      partialize: (state) => ({
        name: state.name,
        boards: state.boards,
        constraints: state.constraints,
      }),
      equality: (a, b) =>
        a.boards === b.boards && a.constraints === b.constraints && a.name === b.name,
    },
  ),
);

/** Re-solve after an undo or redo, since history stores the model only. */
export function resolveAfterHistory(): void {
  const state = useStore.getState();
  useStore.setState(resolved(state.boards, state.constraints));
}

export const selectBoardById = (id: string) => (state: AppState): Board | undefined =>
  state.boards.find((board) => board.id === id);

/**
 * Rewrite a board-plus-ground pair so the board's downward surface is the one
 * used. Pairs that don't involve the ground pass through untouched.
 *
 * Returns `'not-parallel'` when the board surface is vertical, so the caller can
 * say why instead of creating a constraint the solver will only reject.
 */
function resolveGroundPick(
  a: FeatureRef,
  b: FeatureRef,
  boards: ReadonlyMap<string, Board>,
): [FeatureRef, FeatureRef, boolean] | 'not-parallel' {
  const groundIsA = a.kind === 'ground';
  const groundIsB = b.kind === 'ground';
  if (groundIsA === groundIsB) return [a, b, false];

  const boardSide = groundIsA ? b : a;
  if (boardSide.kind !== 'board') return [a, b, false];

  const board = boards.get(boardSide.boardId);
  if (!board) return [a, b, false];

  const feature = groundFacingFeature(board, boardSide.feature);
  if (!feature) return 'not-parallel';

  const corrected = boardRef(board.id, feature);
  const changed = feature !== boardSide.feature;
  return groundIsA ? [a, corrected, changed] : [corrected, b, changed];
}

/** Surfaces the constrain tool should offer, given what has already been picked. */
export function candidateKind(state: AppState, ref: FeatureRef): ConstraintKind | null {
  if (!state.pendingPick) return null;
  const byId = new Map(state.boards.map((board) => [board.id, board] as const));
  const a = refGeometry(state.pendingPick.ref, byId);
  const b = refGeometry(ref, byId);
  if (!a || !b) return null;
  return compatibleKind(a, b);
}

export { boardRef };
