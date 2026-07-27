/** Core domain types. All lengths are millimetres. */

export type Vec3 = readonly [number, number, number];

/**
 * A board's orientation, stored as the world-space images of its three local
 * axes: `[lengthAxis, widthAxis, thicknessAxis]`, right-handed and orthonormal.
 *
 * A basis rather than a quaternion because every question the app actually asks
 * ("which way does this board's `edge+` point?") is answered by reading a column,
 * with no quaternion algebra in between. It also stays legible in saved JSON,
 * and it expresses arbitrary rotations just as well as a quaternion does, so
 * angled members later need no format change.
 */
export type Basis = readonly [Vec3, Vec3, Vec3];

/**
 * The six surfaces of a board, in lumber vocabulary rather than box vocabulary:
 * the two wide surfaces are *faces*, the two narrow long surfaces are *edges*,
 * and the two cut surfaces are *ends*.
 */
export type FeatureName =
  | 'face+'
  | 'face-'
  | 'edge+'
  | 'edge-'
  | 'end+'
  | 'end-';

export const FEATURE_NAMES: readonly FeatureName[] = [
  'face+',
  'face-',
  'edge+',
  'edge-',
  'end+',
  'end-',
];

/** Which local axis a feature's normal runs along, and its sign. */
export const FEATURE_AXIS: Record<FeatureName, { axis: 0 | 1 | 2; sign: 1 | -1 }> = {
  'end+': { axis: 0, sign: 1 },
  'end-': { axis: 0, sign: -1 },
  'edge+': { axis: 1, sign: 1 },
  'edge-': { axis: 1, sign: -1 },
  'face+': { axis: 2, sign: 1 },
  'face-': { axis: 2, sign: -1 },
};

export const FEATURE_LABELS: Record<FeatureName, string> = {
  'face+': 'Face (front)',
  'face-': 'Face (back)',
  'edge+': 'Edge (top)',
  'edge-': 'Edge (bottom)',
  'end+': 'End (far)',
  'end-': 'End (near)',
};

/** Cross-section, actual dimensions — a "2x4" stores 38.1 × 88.9. */
export interface Section {
  /** The long dimension of the cross-section (local Y). */
  width: number;
  /** The short dimension of the cross-section (local Z). */
  thickness: number;
}

export interface Board {
  id: string;
  label: string;
  section: Section;
  /** Preset key such as `2x4`, kept for display and round-tripping. */
  nominal?: string;
  length: number;
  /** Solver output — the rendered position of the board's centroid. */
  position: Vec3;
  /**
   * Where the user last put the board by hand. The solver overrides this along
   * constrained directions only, so unconstrained axes stay where they were put
   * instead of snapping to the origin.
   */
  freePosition: Vec3;
  orientation: Basis;
  /** Pinned boards anchor their connected component; the solver never moves them. */
  pinned: boolean;
  /** Set when the board arrived as part of an inserted assembly. */
  groupId?: string;
}

/** The ground grid participates in constraints as a fixed, singleton surface. */
export const GROUND_ID = '@ground';

export type FeatureRef =
  | { readonly kind: 'board'; readonly boardId: string; readonly feature: FeatureName }
  | { readonly kind: 'ground' };

export const groundRef = (): FeatureRef => ({ kind: 'ground' });

export const boardRef = (boardId: string, feature: FeatureName): FeatureRef => ({
  kind: 'board',
  boardId,
  feature,
});

export const refId = (ref: FeatureRef): string =>
  ref.kind === 'ground' ? GROUND_ID : ref.boardId;

/**
 * `flush` — the two surfaces lie in one plane facing the same way (the outer
 * faces of two studs in a wall).
 *
 * `mate`  — the two surfaces lie in one plane facing each other, i.e. touching
 * (a stud's end butted against a plate's face).
 *
 * Geometrically both say "these planes are coincident"; which one applies is
 * decided by whether the picked normals agree or oppose, so the solver treats
 * them with a single equation and one sign term.
 */
export type ConstraintKind = 'flush' | 'mate';

export interface Constraint {
  id: string;
  kind: ConstraintKind;
  a: FeatureRef;
  b: FeatureRef;
  /** Signed shift of A relative to B along A's outward normal. Usually 0. */
  offset: number;
  enabled: boolean;
}

export type DisplayUnit = 'imperial' | 'metric';

export interface ProjectMeta {
  name: string;
  units: DisplayUnit;
}
