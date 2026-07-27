import { describe, expect, it } from 'vitest';
import { boardFromPreset, createBoard } from '../src/core/board';
import {
  compatibleKind,
  featureCenter,
  featureHalfExtent,
  featureNormal,
  featurePlane,
  groundFacingFeature,
  oppositeFeature,
  matchOrientationPreset,
  orientationPreset,
  ORIENTATION_PRESETS,
  orthonormalize,
  cross,
  dot,
} from '../src/core/geometry';
import { findPreset } from '../src/core/lumber';
import { feet, inches } from '../src/core/units';
import type { Basis } from '../src/core/types';

const twoByFour = findPreset('2x4');
if (!twoByFour) throw new Error('2x4 preset missing');

describe('orientation presets', () => {
  it('are all right-handed orthonormal bases', () => {
    for (const preset of ORIENTATION_PRESETS) {
      const [x, y, z] = preset.basis;
      expect(dot(x, x)).toBeCloseTo(1, 9);
      expect(dot(y, y)).toBeCloseTo(1, 9);
      expect(dot(z, z)).toBeCloseTo(1, 9);
      expect(dot(x, y)).toBeCloseTo(0, 9);
      expect(dot(y, z)).toBeCloseTo(0, 9);
      expect(dot(x, z)).toBeCloseTo(0, 9);

      // Right-handed: length x width = thickness.
      const handed = cross(x, y);
      expect(handed[0]).toBeCloseTo(z[0], 9);
      expect(handed[1]).toBeCloseTo(z[1], 9);
      expect(handed[2]).toBeCloseTo(z[2], 9);
    }
  });

  it('round-trip through matchOrientationPreset', () => {
    for (const preset of ORIENTATION_PRESETS) {
      expect(matchOrientationPreset(preset.basis)?.id).toBeDefined();
    }
    expect(matchOrientationPreset(orientationPreset('joist-x')!.basis)?.id).toBe('joist-x');
  });

  it('puts a flat plate wide-face-up', () => {
    const plate = boardFromPreset(twoByFour, feet(8), 'plate', {
      orientation: orientationPreset('plate-x')!.basis,
    });
    // Thickness axis points up, so the wide face looks at the sky.
    expect(featureNormal(plate, 'face+')).toEqual([0, 1, 0]);
    // 1 1/2" thick, so half-extent up from the centroid is 3/4".
    expect(featureHalfExtent(plate, 'face+')).toBeCloseTo(inches(0.75), 9);
  });

  it('stands a stud on its end', () => {
    const stud = boardFromPreset(twoByFour, feet(8), 'stud', {
      orientation: orientationPreset('stud-face-z')!.basis,
    });
    expect(featureNormal(stud, 'end+')).toEqual([0, 1, 0]);
    expect(featureHalfExtent(stud, 'end+')).toBeCloseTo(feet(4), 9);
  });
});

describe('orthonormalize', () => {
  it('repairs a drifted basis', () => {
    const drifted: Basis = [
      [1.0001, 0.0002, 0],
      [0.0003, 0.9998, 0],
      [0, 0, 1.0004],
    ];
    const [x, y, z] = orthonormalize(drifted);
    expect(dot(x, x)).toBeCloseTo(1, 9);
    expect(dot(x, y)).toBeCloseTo(0, 9);
    expect(dot(z, z)).toBeCloseTo(1, 9);
  });
});

describe('feature planes', () => {
  it('places the plane a half-extent out from the centroid', () => {
    const board = createBoard({
      label: 'b',
      section: { thickness: 40, width: 100 },
      length: 1000,
      position: [10, 20, 30],
    });
    const plane = featurePlane(board, 'face+');
    // face+ is +Z locally, and the default basis is the identity.
    expect(plane.normal).toEqual([0, 0, 1]);
    expect(plane.d).toBeCloseTo(30 + 20, 9);
    expect(featureCenter(board, 'face+')).toEqual([10, 20, 50]);
  });
});

describe('groundFacingFeature', () => {
  const plate = boardFromPreset(twoByFour, feet(8), 'plate', {
    orientation: orientationPreset('plate-x')!.basis,
  });

  it('turns a click on the top into the surface that rests on the floor', () => {
    // Clicking the top and then the grid means "put it down", not "bury it".
    expect(groundFacingFeature(plate, 'face+')).toBe('face-');
  });

  it('leaves a downward surface alone', () => {
    expect(groundFacingFeature(plate, 'face-')).toBe('face-');
  });

  it('refuses a vertical surface, which cannot rest on anything', () => {
    expect(groundFacingFeature(plate, 'end+')).toBeNull();
    expect(groundFacingFeature(plate, 'edge+')).toBeNull();
  });

  it('resolves the resting surface for an upright board too', () => {
    const stud = boardFromPreset(twoByFour, feet(8), 'stud', {
      orientation: orientationPreset('stud-face-z')!.basis,
    });
    // A stud's length runs vertically, so it stands on its lower end.
    expect(groundFacingFeature(stud, 'end+')).toBe('end-');
    expect(groundFacingFeature(stud, 'face+')).toBeNull();
  });
});

describe('oppositeFeature', () => {
  it('flips every surface to its partner', () => {
    expect(oppositeFeature('face+')).toBe('face-');
    expect(oppositeFeature('face-')).toBe('face+');
    expect(oppositeFeature('edge+')).toBe('edge-');
    expect(oppositeFeature('end-')).toBe('end+');
  });
});

describe('compatibleKind', () => {
  it('calls opposing normals a mate and agreeing normals flush', () => {
    expect(compatibleKind({ normal: [0, 1, 0] }, { normal: [0, -1, 0] })).toBe('mate');
    expect(compatibleKind({ normal: [0, 1, 0] }, { normal: [0, 1, 0] })).toBe('flush');
  });

  it('refuses non-parallel surfaces', () => {
    expect(compatibleKind({ normal: [0, 1, 0] }, { normal: [1, 0, 0] })).toBeNull();
  });
});
