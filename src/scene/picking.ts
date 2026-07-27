import * as THREE from 'three';
import type { Board, FeatureName, Vec3 } from '../core/types';
import { FEATURE_AXIS } from '../core/types';
import { halfExtents } from '../core/geometry';

/**
 * Mapping a raycast hit back to a named surface.
 *
 * `BoxGeometry` emits its six sides as material groups in a fixed order:
 * +X, -X, +Y, -Y, +Z, -Z. Board geometry is built as
 * `BoxGeometry(length, width, thickness)`, so those groups line up exactly with
 * the local axes the domain model uses — X is length, Y is width, Z is
 * thickness — and the mapping is a lookup rather than a calculation.
 */
export const BOX_GROUP_TO_FEATURE: readonly FeatureName[] = [
  'end+',
  'end-',
  'edge+',
  'edge-',
  'face+',
  'face-',
];

export function featureFromIntersection(intersection: THREE.Intersection): FeatureName | null {
  const { face, faceIndex } = intersection;
  if (!face || faceIndex === undefined || faceIndex === null) return null;

  /*
   * Derived from `faceIndex`, deliberately not from `face.materialIndex`.
   *
   * three only fills in `materialIndex` when the mesh carries an *array* of
   * materials and it walks the geometry group by group. Board meshes use a
   * single material, so that field stays at its initial 0 and every pick would
   * silently resolve to the same surface. `faceIndex` is always real: a
   * default `BoxGeometry` emits its six sides in the order +X, -X, +Y, -Y, +Z,
   * -Z at two triangles each, so halving it gives the side.
   */
  const group = Math.floor(faceIndex / 2);
  return BOX_GROUP_TO_FEATURE[group] ?? null;
}

/** World matrix for a board: its orientation basis, translated to its position. */
export function boardMatrix(board: Board, target = new THREE.Matrix4()): THREE.Matrix4 {
  const [bx, by, bz] = board.orientation;
  target.makeBasis(
    new THREE.Vector3(bx[0], bx[1], bx[2]),
    new THREE.Vector3(by[0], by[1], by[2]),
    new THREE.Vector3(bz[0], bz[1], bz[2]),
  );
  target.setPosition(board.position[0], board.position[1], board.position[2]);
  return target;
}

/** Local-space placement of a highlight quad covering one surface. */
export interface FaceQuad {
  position: Vec3;
  rotation: Vec3;
  size: [number, number];
}

export function faceQuad(board: Board, feature: FeatureName): FaceQuad {
  const [hl, hw, ht] = halfExtents(board);
  const { axis, sign } = FEATURE_AXIS[feature];

  if (axis === 0) {
    return {
      position: [sign * hl, 0, 0],
      rotation: [0, (sign * Math.PI) / 2, 0],
      size: [ht * 2, hw * 2],
    };
  }
  if (axis === 1) {
    return {
      position: [0, sign * hw, 0],
      rotation: [(-sign * Math.PI) / 2, 0, 0],
      size: [hl * 2, ht * 2],
    };
  }
  return {
    position: [0, 0, sign * ht],
    rotation: [0, sign > 0 ? 0 : Math.PI, 0],
    size: [hl * 2, hw * 2],
  };
}

/** Axis-aligned bounds of the whole model, for "frame all". */
export function modelBounds(boards: readonly Board[]): THREE.Box3 | null {
  if (boards.length === 0) return null;

  const box = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  const corner = new THREE.Vector3();

  for (const board of boards) {
    boardMatrix(board, matrix);
    const [hl, hw, ht] = halfExtents(board);
    for (const sl of [-1, 1]) {
      for (const sw of [-1, 1]) {
        for (const st of [-1, 1]) {
          corner.set(sl * hl, sw * hw, st * ht).applyMatrix4(matrix);
          box.expandByPoint(corner);
        }
      }
    }
  }
  return box;
}
