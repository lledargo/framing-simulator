import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { boardFromPreset } from '../src/core/board';
import { featureNormal } from '../src/core/geometry';
import { boardMatrix, featureFromIntersection, modelBounds } from '../src/scene/picking';
import { feet } from '../src/core/units';
import type { FeatureName } from '../src/core/types';
import { requireOrientation, requirePreset } from './helpers';

const twoByFour = requirePreset('2x4');

/**
 * Raycast a real `BoxGeometry` from each of the six directions and check the
 * hit maps back to the surface actually facing that way.
 *
 * This exists because of a bug that type-checked and rendered perfectly: three
 * only populates `face.materialIndex` for meshes with an array of materials, so
 * reading it from a single-material mesh returns 0 for every hit and every
 * surface pick resolves to the same face. Nothing catches that except aiming a
 * ray at a box and looking at what comes back.
 */
function pickFrom(mesh: THREE.Mesh, from: THREE.Vector3): FeatureName | null {
  const raycaster = new THREE.Raycaster();
  const direction = from.clone().negate().normalize();
  raycaster.set(from, direction);

  const hits = raycaster.intersectObject(mesh, false);
  const first = hits[0];
  return first ? featureFromIntersection(first) : null;
}

describe('featureFromIntersection', () => {
  const mesh = new THREE.Mesh(
    // length (X) x width (Y) x thickness (Z), matching BoardMesh.
    new THREE.BoxGeometry(1000, 200, 40),
    new THREE.MeshBasicMaterial(),
  );

  const cases: ReadonlyArray<[string, THREE.Vector3, FeatureName]> = [
    ['+X', new THREE.Vector3(5000, 0, 0), 'end+'],
    ['-X', new THREE.Vector3(-5000, 0, 0), 'end-'],
    ['+Y', new THREE.Vector3(0, 5000, 0), 'edge+'],
    ['-Y', new THREE.Vector3(0, -5000, 0), 'edge-'],
    ['+Z', new THREE.Vector3(0, 0, 5000), 'face+'],
    ['-Z', new THREE.Vector3(0, 0, -5000), 'face-'],
  ];

  for (const [label, origin, expected] of cases) {
    it(`maps a hit from ${label} to ${expected}`, () => {
      expect(pickFrom(mesh, origin)).toBe(expected);
    });
  }
});

describe('picking a flat board from above', () => {
  it('returns the surface whose normal actually points up', () => {
    // A plate lying flat: thickness is the vertical dimension.
    const plate = boardFromPreset(twoByFour, feet(8), 'plate', {
      orientation: requireOrientation('plate-x'),
      position: [0, 19.05, 0],
    });

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(plate.length, plate.section.width, plate.section.thickness),
      new THREE.MeshBasicMaterial(),
    );
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(boardMatrix(plate));
    mesh.matrixWorld.copy(mesh.matrix);
    mesh.matrixWorldNeedsUpdate = false;

    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(0, 5000, 0), new THREE.Vector3(0, -1, 0));
    const hit = raycaster.intersectObject(mesh, false)[0];
    expect(hit).toBeDefined();

    const feature = featureFromIntersection(hit as THREE.Intersection);
    expect(feature).toBe('face+');

    // The whole point: this surface must be parallel to the ground, or it
    // cannot be mated to it.
    const normal = featureNormal(plate, feature as FeatureName);
    expect(normal[1]).toBeCloseTo(1, 9);
  });
});

describe('modelBounds', () => {
  it('covers every board', () => {
    const a = boardFromPreset(twoByFour, feet(8), 'a', { position: [0, 100, 0] });
    const b = boardFromPreset(twoByFour, feet(8), 'b', { position: [3000, 100, 0] });

    const box = modelBounds([a, b]);
    expect(box).not.toBeNull();
    expect(box?.min.x).toBeCloseTo(-feet(4), 4);
    expect(box?.max.x).toBeCloseTo(3000 + feet(4), 4);
  });

  it('is null for an empty model', () => {
    expect(modelBounds([])).toBeNull();
  });
});
