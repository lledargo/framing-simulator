import type { Basis, Board, FeatureName, FeatureRef, Vec3 } from './types';
import { FEATURE_AXIS } from './types';

export const EPSILON = 1e-6;

export const vec = (x: number, y: number, z: number): Vec3 => [x, y, z];

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];

export const negate = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];

export const lengthOf = (a: Vec3): number => Math.sqrt(dot(a, a));

export function normalize(a: Vec3): Vec3 {
  const len = lengthOf(a);
  return len < EPSILON ? [0, 0, 0] : [a[0] / len, a[1] / len, a[2] / len];
}

/** Right-handed orthonormal basis with local X = length, Y = width, Z = thickness. */
export const IDENTITY_BASIS: Basis = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/**
 * Named orientations covering the ways framing lumber actually sits. Each is a
 * right-handed basis: length axis, width axis, thickness axis.
 */
export interface OrientationPreset {
  id: string;
  label: string;
  hint: string;
  basis: Basis;
}

export const ORIENTATION_PRESETS: readonly OrientationPreset[] = [
  {
    id: 'plate-x',
    label: 'Flat, running X',
    hint: 'Plate lying flat, wide face up',
    basis: [
      [1, 0, 0],
      [0, 0, -1],
      [0, 1, 0],
    ],
  },
  {
    id: 'plate-z',
    label: 'Flat, running Z',
    hint: 'Plate lying flat, wide face up',
    basis: [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
  },
  {
    id: 'joist-x',
    label: 'On edge, running X',
    hint: 'Joist or rim, wide face vertical',
    basis: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  },
  {
    id: 'joist-z',
    label: 'On edge, running Z',
    hint: 'Joist or rim, wide face vertical',
    basis: [
      [0, 0, 1],
      [0, 1, 0],
      [-1, 0, 0],
    ],
  },
  {
    id: 'stud-face-x',
    label: 'Upright, face toward X',
    hint: 'Stud in a wall running Z',
    basis: [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ],
  },
  {
    id: 'stud-face-z',
    label: 'Upright, face toward Z',
    hint: 'Stud in a wall running X',
    basis: [
      [0, 1, 0],
      [-1, 0, 0],
      [0, 0, 1],
    ],
  },
  {
    id: 'post',
    label: 'Upright post',
    hint: 'Vertical, running Y',
    basis: [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ],
  },
];

export function orientationPreset(id: string): OrientationPreset | undefined {
  return ORIENTATION_PRESETS.find((preset) => preset.id === id);
}

/**
 * Find the preset a basis corresponds to, if any. Used so the inspector can
 * show which orientation is active after a load or an undo.
 */
export function matchOrientationPreset(basis: Basis): OrientationPreset | undefined {
  return ORIENTATION_PRESETS.find((preset) =>
    preset.basis.every((axis, i) => {
      const other = basis[i];
      return other !== undefined && axis.every((v, j) => Math.abs(v - (other[j] ?? 0)) < EPSILON);
    }),
  );
}

/**
 * Re-orthonormalise a basis via Gram-Schmidt. Repeated edits and file
 * round-trips let tiny errors creep in; feature normals must stay unit-length
 * or the solver's family grouping starts splitting hairs that aren't there.
 */
export function orthonormalize(basis: Basis): Basis {
  const x = normalize(basis[0]);
  const yRaw = sub(basis[1], scale(x, dot(basis[1], x)));
  const y = normalize(yRaw);
  const z = cross(x, y);
  return [cleanZeros(x), cleanZeros(y), cleanZeros(z)];
}

/**
 * Collapse negative zero to zero. `-0` compares equal to `0` so nothing
 * computes differently, but it survives into saved JSON as `-0` and makes
 * otherwise-identical bases look different when diffing project files.
 */
function cleanZeros(v: Vec3): Vec3 {
  return [v[0] + 0, v[1] + 0, v[2] + 0];
}

/** Half-extents along the board's own axes: [length/2, width/2, thickness/2]. */
export function halfExtents(board: Board): Vec3 {
  return [board.length / 2, board.section.width / 2, board.section.thickness / 2];
}

/** World-space outward normal of one of the board's six surfaces. */
export function featureNormal(board: Board, feature: FeatureName): Vec3 {
  const { axis, sign } = FEATURE_AXIS[feature];
  const axisVector = board.orientation[axis] ?? [0, 0, 0];
  return sign === 1 ? axisVector : negate(axisVector);
}

/** Distance from the board's centroid out to the surface, along that normal. */
export function featureHalfExtent(board: Board, feature: FeatureName): number {
  const { axis } = FEATURE_AXIS[feature];
  return halfExtents(board)[axis] ?? 0;
}

/**
 * A surface as a world plane `normal · p = d`, using the board's *current*
 * solved position.
 */
export interface FeaturePlane {
  normal: Vec3;
  d: number;
  /** Centroid-to-surface distance along `normal`; the solver needs it separately. */
  halfExtent: number;
}

export function featurePlane(board: Board, feature: FeatureName): FeaturePlane {
  const normal = featureNormal(board, feature);
  const halfExtent = featureHalfExtent(board, feature);
  return { normal, d: dot(normal, board.position) + halfExtent, halfExtent };
}

/** The ground grid, modelled as a fixed board-like surface at Y = 0. */
export const GROUND_NORMAL: Vec3 = [0, 1, 0];
export const GROUND_PLANE: FeaturePlane = { normal: GROUND_NORMAL, d: 0, halfExtent: 0 };

/** Normal and half-extent for either kind of feature reference. */
export function refGeometry(
  ref: FeatureRef,
  boards: ReadonlyMap<string, Board>,
): { normal: Vec3; halfExtent: number } | null {
  if (ref.kind === 'ground') {
    return { normal: GROUND_NORMAL, halfExtent: 0 };
  }
  const board = boards.get(ref.boardId);
  if (!board) return null;
  return {
    normal: featureNormal(board, ref.feature),
    halfExtent: featureHalfExtent(board, ref.feature),
  };
}

/** The centre point of a surface, for placing UI markers and highlights. */
export function featureCenter(board: Board, feature: FeatureName): Vec3 {
  return add(board.position, scale(featureNormal(board, feature), featureHalfExtent(board, feature)));
}

/**
 * Which constraint kind two picked surfaces can form. Coincident planes whose
 * normals oppose are surfaces in contact (`mate`); normals that agree put both
 * surfaces in one plane facing the same way (`flush`). Non-parallel normals
 * admit neither, because this solver never rotates a board to satisfy a
 * constraint — the user sets orientation explicitly.
 */
export function compatibleKind(
  a: { normal: Vec3 },
  b: { normal: Vec3 },
): 'flush' | 'mate' | null {
  const alignment = dot(a.normal, b.normal);
  if (alignment > 1 - 1e-4) return 'flush';
  if (alignment < -1 + 1e-4) return 'mate';
  return null;
}

/** The eight corners of a board, in world space. */
export function boardCorners(board: Board): Vec3[] {
  const [hl, hw, ht] = halfExtents(board);
  const [ax, ay, az] = board.orientation;
  const corners: Vec3[] = [];
  for (const sl of [-1, 1]) {
    for (const sw of [-1, 1]) {
      for (const st of [-1, 1]) {
        corners.push(
          add(
            board.position,
            add(add(scale(ax, sl * hl), scale(ay, sw * hw)), scale(az, st * ht)),
          ),
        );
      }
    }
  }
  return corners;
}
