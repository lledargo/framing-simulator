import { describe, expect, it } from 'vitest';
import { boardFromPreset, createConstraint } from '../src/core/board';
import { resolveBoards, solveModel } from '../src/core/solver';
import { boardRef, groundRef } from '../src/core/types';
import type { Board, Constraint } from '../src/core/types';
import { feet, inches } from '../src/core/units';
import { requireOrientation, requirePreset } from './helpers';

const twoByFour = requirePreset('2x4');
const PLATE = requireOrientation('plate-x');
const STUD = requireOrientation('stud-face-z');

const y = (board: Board | undefined): number => board?.position[1] ?? Number.NaN;
const x = (board: Board | undefined): number => board?.position[0] ?? Number.NaN;

/** A conventional 8ft stud wall: two flat plates and precut studs between them. */
function studWall(studLength = inches(92.625)) {
  const bottomPlate = boardFromPreset(twoByFour, feet(8), 'Bottom plate', { orientation: PLATE });
  const topPlate = boardFromPreset(twoByFour, feet(8), 'Top plate', { orientation: PLATE });
  const stud = boardFromPreset(twoByFour, studLength, 'Stud', { orientation: STUD });

  const constraints: Constraint[] = [
    createConstraint('mate', boardRef(bottomPlate.id, 'face-'), groundRef()),
    createConstraint('mate', boardRef(stud.id, 'end-'), boardRef(bottomPlate.id, 'face+')),
    createConstraint('mate', boardRef(stud.id, 'end+'), boardRef(topPlate.id, 'face-')),
    createConstraint('flush', boardRef(stud.id, 'edge-'), boardRef(bottomPlate.id, 'end+')),
  ];

  return { boards: [bottomPlate, topPlate, stud], constraints, bottomPlate, topPlate, stud };
}

describe('grounding', () => {
  it('rests a board on the grid at half its thickness', () => {
    const plate = boardFromPreset(twoByFour, feet(8), 'plate', {
      orientation: PLATE,
      position: [0, 500, 0],
    });
    const constraints = [createConstraint('mate', boardRef(plate.id, 'face-'), groundRef())];

    const { boards } = resolveBoards([plate], constraints);
    expect(y(boards[0])).toBeCloseTo(inches(0.75), 6);
  });

  it('leaves unconstrained axes where the user put them', () => {
    const plate = boardFromPreset(twoByFour, feet(8), 'plate', {
      orientation: PLATE,
      position: [123, 500, -456],
    });
    const constraints = [createConstraint('mate', boardRef(plate.id, 'face-'), groundRef())];

    const { boards } = resolveBoards([plate], constraints);
    expect(boards[0]?.position[0]).toBeCloseTo(123, 6);
    expect(boards[0]?.position[2]).toBeCloseTo(-456, 6);
  });

  it('does not move a board that has no constraints at all', () => {
    const board = boardFromPreset(twoByFour, feet(8), 'loose', { position: [10, 20, 30] });
    const { boards } = resolveBoards([board], []);
    expect(boards[0]?.position).toEqual([10, 20, 30]);
  });
});

describe('stud wall', () => {
  it('stacks plate, stud and plate into one wall', () => {
    const wall = studWall();
    const { boards, result } = resolveBoards(wall.boards, wall.constraints);
    expect(result.conflicts.size).toBe(0);
    expect(result.invalid.size).toBe(0);

    const solved = new Map(boards.map((b) => [b.id, b]));
    const bottom = solved.get(wall.bottomPlate.id);
    const stud = solved.get(wall.stud.id);
    const top = solved.get(wall.topPlate.id);

    // Bottom of the stud sits on top of the bottom plate.
    expect(y(stud) - inches(92.625) / 2).toBeCloseTo(inches(1.5), 6);
    // Underside of the top plate sits on top of the stud.
    expect(y(top) - inches(0.75)).toBeCloseTo(inches(94.125), 6);
    // Overall wall height is the familiar 95 5/8".
    expect(y(top) + inches(0.75)).toBeCloseTo(inches(95.625), 6);
    expect(y(bottom)).toBeCloseTo(inches(0.75), 6);
  });

  it('aligns the end stud flush with the end of the plate', () => {
    const wall = studWall();
    const { boards } = resolveBoards(wall.boards, wall.constraints);
    const solved = new Map(boards.map((b) => [b.id, b]));
    const stud = solved.get(wall.stud.id);
    // Stud is 3 1/2" wide, so its centre sits 1 3/4" in from the plate's end.
    expect(x(stud)).toBeCloseTo(feet(4) - inches(1.75), 6);
  });

  it('carries a stud length change through to the top plate', () => {
    const short = resolveBoards(studWall(inches(92.625)).boards, studWall().constraints);
    const wall = studWall(inches(104.625));
    const tall = resolveBoards(wall.boards, wall.constraints);

    const tallTop = tall.boards.find((b) => b.id === wall.topPlate.id);
    expect(y(tallTop) + inches(0.75)).toBeCloseTo(inches(107.625), 6);
    expect(short.result.conflicts.size).toBe(0);
  });

  it('re-solves when a plate gets thicker', () => {
    const wall = studWall();
    const thicker = wall.boards.map((board) =>
      board.id === wall.bottomPlate.id
        ? { ...board, section: { ...board.section, thickness: inches(3) } }
        : board,
    );

    const { boards } = resolveBoards(thicker, wall.constraints);
    const stud = boards.find((b) => b.id === wall.stud.id);
    // A 3" bottom plate lifts the stud by an extra 1 1/2".
    expect(y(stud) - inches(92.625) / 2).toBeCloseTo(inches(3), 6);
  });
});

describe('on-centre spacing', () => {
  it('spaces identical studs by a flush constraint with an offset', () => {
    const first = boardFromPreset(twoByFour, inches(92.625), 'S1', {
      orientation: STUD,
      position: [0, 0, 0],
      pinned: true,
    });
    const second = boardFromPreset(twoByFour, inches(92.625), 'S2', { orientation: STUD });
    const third = boardFromPreset(twoByFour, inches(92.625), 'S3', { orientation: STUD });

    const constraints = [
      createConstraint('flush', boardRef(second.id, 'edge-'), boardRef(first.id, 'edge-'), inches(16)),
      createConstraint('flush', boardRef(third.id, 'edge-'), boardRef(second.id, 'edge-'), inches(16)),
    ];

    const { boards, result } = resolveBoards([first, second, third], constraints);
    expect(result.conflicts.size).toBe(0);

    const byId = new Map(boards.map((b) => [b.id, b]));
    // Same feature on same-width boards means face spacing equals centre spacing.
    expect(x(byId.get(second.id))).toBeCloseTo(inches(16), 6);
    expect(x(byId.get(third.id))).toBeCloseTo(inches(32), 6);
  });
});

describe('cycles', () => {
  const chain = (offsetAC: number) => {
    const a = boardFromPreset(twoByFour, feet(8), 'A', { orientation: STUD, pinned: true });
    const b = boardFromPreset(twoByFour, feet(8), 'B', { orientation: STUD });
    const c = boardFromPreset(twoByFour, feet(8), 'C', { orientation: STUD });

    const constraints = [
      createConstraint('flush', boardRef(b.id, 'edge-'), boardRef(a.id, 'edge-'), 100),
      createConstraint('flush', boardRef(c.id, 'edge-'), boardRef(b.id, 'edge-'), 100),
      createConstraint('flush', boardRef(c.id, 'edge-'), boardRef(a.id, 'edge-'), offsetAC),
    ];
    return { boards: [a, b, c], constraints, a, b, c };
  };

  it('accepts a cycle whose offsets agree', () => {
    const model = chain(200);
    const { boards, result } = resolveBoards(model.boards, model.constraints);
    expect(result.conflicts.size).toBe(0);
    const byId = new Map(boards.map((bd) => [bd.id, bd]));
    expect(x(byId.get(model.c.id))).toBeCloseTo(200, 6);
  });

  it('flags a cycle whose offsets disagree, and reports how far off it is', () => {
    const model = chain(150);
    const { result } = resolveBoards(model.boards, model.constraints);
    expect(result.conflicts.size).toBeGreaterThan(0);

    const worst = Math.max(...[...result.conflicts.values()].map((conflict) => conflict.residual));
    expect(worst).toBeCloseTo(50, 6);
  });
});

describe('malformed constraints', () => {
  it('rejects surfaces that are not parallel', () => {
    const plate = boardFromPreset(twoByFour, feet(8), 'plate', { orientation: PLATE });
    const stud = boardFromPreset(twoByFour, feet(8), 'stud', { orientation: STUD });
    // The plate's face points up; the stud's edge points along X.
    const bad = createConstraint('mate', boardRef(stud.id, 'edge-'), boardRef(plate.id, 'face+'));

    const result = solveModel([plate, stud], [bad]);
    expect(result.invalid.get(bad.id)).toBe('not-parallel');
  });

  it('rejects a mate between surfaces that face the same way', () => {
    const a = boardFromPreset(twoByFour, feet(8), 'a', { orientation: PLATE });
    const b = boardFromPreset(twoByFour, feet(8), 'b', { orientation: PLATE });
    const bad = createConstraint('mate', boardRef(a.id, 'face+'), boardRef(b.id, 'face+'));

    const result = solveModel([a, b], [bad]);
    expect(result.invalid.get(bad.id)).toBe('wrong-kind');
  });

  it('rejects a constraint pointing at a deleted board', () => {
    const a = boardFromPreset(twoByFour, feet(8), 'a', { orientation: PLATE });
    const bad = createConstraint('mate', boardRef(a.id, 'face-'), boardRef('bd_gone', 'face+'));

    const result = solveModel([a], [bad]);
    expect(result.invalid.get(bad.id)).toBe('missing-board');
  });

  it('ignores disabled constraints', () => {
    const plate = boardFromPreset(twoByFour, feet(8), 'plate', {
      orientation: PLATE,
      position: [0, 500, 0],
    });
    const disabled = {
      ...createConstraint('mate', boardRef(plate.id, 'face-'), groundRef()),
      enabled: false,
    };

    const { boards } = resolveBoards([plate], [disabled]);
    expect(y(boards[0])).toBeCloseTo(500, 6);
  });
});

describe('pinning', () => {
  it('holds a pinned board still and reports the constraint it breaks', () => {
    const plate = boardFromPreset(twoByFour, feet(8), 'plate', {
      orientation: PLATE,
      position: [0, 500, 0],
      pinned: true,
    });
    const grounded = createConstraint('mate', boardRef(plate.id, 'face-'), groundRef());

    const { boards, result } = resolveBoards([plate], [grounded]);
    expect(y(boards[0])).toBeCloseTo(500, 6);
    expect(result.conflicts.has(grounded.id)).toBe(true);
  });
});
