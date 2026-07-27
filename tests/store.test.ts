import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/state/store';
import { boardRef, groundRef } from '../src/core/types';
import { inches } from '../src/core/units';
import { requireOrientation } from './helpers';

/**
 * Store-level tests for the constrain tool.
 *
 * These cover the path a click actually takes — pick a surface, pick another,
 * get a constraint — without going through the renderer. The 3D side of it is
 * covered separately by `picking.test.ts` (does a ray hit map to the right
 * surface?), so between them the whole chain from click to solved position is
 * checked without depending on where a pixel happens to land.
 */

const reset = (): void => {
  useStore.setState({
    boards: [],
    constraints: [],
    selection: [],
    pendingPick: null,
    statusMessage: null,
    tool: 'select',
  });
  useStore.temporal.getState().clear();
};

const state = () => useStore.getState();

describe('adding boards', () => {
  beforeEach(reset);

  it('lays new boards flat and resting on the grid', () => {
    state().addBoardFromPreset('2x4');
    const board = state().boards[0];
    expect(board).toBeDefined();
    // Flat means the thickness is vertical, so a resting board's centroid sits
    // at half its thickness — not half its width.
    expect(board?.position[1]).toBeCloseTo(inches(0.75), 6);
  });

  it('staggers boards so they do not land inside each other', () => {
    state().addBoardFromPreset('2x4');
    state().addBoardFromPreset('2x4');
    const [a, b] = state().boards;
    const gap = Math.abs((b?.position[2] ?? 0) - (a?.position[2] ?? 0));
    expect(gap).toBeGreaterThan(inches(3.5));
  });

  it('numbers boards by section', () => {
    state().addBoardFromPreset('2x4');
    state().addBoardFromPreset('2x4');
    state().addBoardFromPreset('2x6');
    expect(state().boards.map((b) => b.label)).toEqual(['2x4 #1', '2x4 #2', '2x6 #1']);
  });
});

describe('the constrain tool', () => {
  beforeEach(() => {
    reset();
    state().addBoardFromPreset('2x4');
    state().addBoardFromPreset('2x4');
    state().setTool('constrain');
  });

  const ids = () => state().boards.map((board) => board.id);

  it('holds the first pick and waits for a second', () => {
    const [a] = ids();
    state().pickFeature(boardRef(a as string, 'face+'));

    expect(state().pendingPick).not.toBeNull();
    expect(state().constraints).toHaveLength(0);
    expect(state().statusMessage).toMatch(/now pick/i);
  });

  it('makes two upward faces flush', () => {
    const [a, b] = ids();
    state().pickFeature(boardRef(a as string, 'face+'));
    state().pickFeature(boardRef(b as string, 'face+'));

    expect(state().constraints).toHaveLength(1);
    expect(state().constraints[0]?.kind).toBe('flush');
    expect(state().pendingPick).toBeNull();
    expect(state().solve.conflicts.size).toBe(0);
    expect(state().solve.invalid.size).toBe(0);

    // Same section, so flush tops means identical heights.
    const [boardA, boardB] = state().boards;
    expect(boardB?.position[1]).toBeCloseTo(boardA?.position[1] ?? 0, 6);
  });

  it('mates a board end against another board face', () => {
    const [a, b] = ids();
    state().updateBoard(b as string, { orientation: requireOrientation('stud-face-z') });

    state().pickFeature(boardRef(b as string, 'end-'));
    state().pickFeature(boardRef(a as string, 'face+'));

    expect(state().constraints[0]?.kind).toBe('mate');
    expect(state().solve.conflicts.size).toBe(0);

    const plate = state().boards.find((board) => board.id === a);
    const stud = state().boards.find((board) => board.id === b);
    const studBottom = (stud?.position[1] ?? 0) - (stud?.length ?? 0) / 2;
    const plateTop = (plate?.position[1] ?? 0) + inches(0.75);
    expect(studBottom).toBeCloseTo(plateTop, 6);
  });

  it('rests a board on the ground even when its top face was picked', () => {
    const [a] = ids();
    state().updateBoard(a as string, { freePosition: [0, 5000, 0] });

    state().pickFeature(boardRef(a as string, 'face+'));
    state().pickFeature(groundRef());

    const constraint = state().constraints[0];
    expect(constraint?.kind).toBe('mate');
    // The upward pick is rewritten to the surface that can actually rest.
    expect(constraint?.a).toMatchObject({ feature: 'face-' });

    const board = state().boards.find((entry) => entry.id === a);
    expect(board?.position[1]).toBeCloseTo(inches(0.75), 6);
  });

  it('refuses two surfaces that are not parallel, without creating anything', () => {
    const [a, b] = ids();
    state().pickFeature(boardRef(a as string, 'face+'));
    state().pickFeature(boardRef(b as string, 'end+'));

    expect(state().constraints).toHaveLength(0);
    expect(state().statusMessage).toMatch(/not parallel/i);
    // The first pick survives, so the user can just click somewhere else.
    expect(state().pendingPick).not.toBeNull();
  });

  it('refuses a vertical surface against the ground with a useful message', () => {
    const [a] = ids();
    state().pickFeature(boardRef(a as string, 'end+'));
    state().pickFeature(groundRef());

    expect(state().constraints).toHaveLength(0);
    expect(state().statusMessage).toMatch(/vertical/i);
  });

  it('refuses to constrain a board to itself', () => {
    const [a] = ids();
    state().pickFeature(boardRef(a as string, 'face+'));
    state().pickFeature(boardRef(a as string, 'face-'));

    expect(state().constraints).toHaveLength(0);
    expect(state().statusMessage).toMatch(/different board/i);
  });
});

describe('deleting', () => {
  beforeEach(reset);

  it('takes a board’s constraints with it', () => {
    state().addBoardFromPreset('2x4');
    state().addBoardFromPreset('2x4');
    const [a, b] = state().boards.map((board) => board.id);

    state().addConstraint('flush', boardRef(a as string, 'face+'), boardRef(b as string, 'face+'));
    expect(state().constraints).toHaveLength(1);

    state().deleteBoards([b as string]);
    expect(state().boards).toHaveLength(1);
    expect(state().constraints).toHaveLength(0);
  });
});

describe('re-solving on edit', () => {
  beforeEach(reset);

  it('moves dependents when a board grows', () => {
    state().addBoardFromPreset('2x4');
    state().addBoardFromPreset('2x4');
    const [plateId, studId] = state().boards.map((board) => board.id);

    state().updateBoard(studId as string, {
      orientation: requireOrientation('stud-face-z'),
      length: inches(92.625),
    });
    state().addConstraint('mate', boardRef(plateId as string, 'face-'), groundRef());
    state().addConstraint(
      'mate',
      boardRef(studId as string, 'end-'),
      boardRef(plateId as string, 'face+'),
    );

    const topOf = (id: string): number => {
      const board = state().boards.find((entry) => entry.id === id);
      return (board?.position[1] ?? 0) + (board?.length ?? 0) / 2;
    };

    expect(topOf(studId as string)).toBeCloseTo(inches(1.5 + 92.625), 6);

    // A thicker plate lifts the stud, and the wall gets taller by the same amount.
    state().updateBoard(plateId as string, {
      section: { thickness: inches(3), width: inches(3.5) },
      nominal: undefined,
    });
    expect(topOf(studId as string)).toBeCloseTo(inches(3 + 92.625), 6);
    expect(state().solve.conflicts.size).toBe(0);
  });
});
