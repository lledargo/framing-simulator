import { describe, expect, it } from 'vitest';
import { boardFromPreset, createConstraint } from '../src/core/board';
import {
  extractSubgraph,
  parseProject,
  ProjectParseError,
  projectToJson,
  remapIds,
  SCHEMA_VERSION,
} from '../src/core/project';
import { resolveBoards } from '../src/core/solver';
import { boardRef, groundRef } from '../src/core/types';
import { feet, inches } from '../src/core/units';
import { requireOrientation, requirePreset } from './helpers';

const twoByFour = requirePreset('2x4');

function sampleModel() {
  const plate = boardFromPreset(twoByFour, feet(8), 'Bottom plate', {
    orientation: requireOrientation('plate-x'),
  });
  const stud = boardFromPreset(twoByFour, inches(92.625), 'Stud', {
    orientation: requireOrientation('stud-face-z'),
  });
  const constraints = [
    createConstraint('mate', boardRef(plate.id, 'face-'), groundRef()),
    createConstraint('mate', boardRef(stud.id, 'end-'), boardRef(plate.id, 'face+')),
  ];
  const { boards } = resolveBoards([plate, stud], constraints);
  return { boards, constraints, plate, stud };
}

describe('save and load', () => {
  it('round-trips a model to the same solved geometry', () => {
    const model = sampleModel();
    const json = projectToJson({
      name: 'Test wall',
      units: 'imperial',
      boards: model.boards,
      constraints: model.constraints,
    });

    const parsed = parseProject(json);
    expect(parsed.name).toBe('Test wall');
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.boards).toHaveLength(2);
    expect(parsed.constraints).toHaveLength(2);

    const reloaded = resolveBoards(parsed.boards, parsed.constraints);
    for (const original of model.boards) {
      const match = reloaded.boards.find((board) => board.id === original.id);
      expect(match?.position[1]).toBeCloseTo(original.position[1], 9);
    }
  });

  it('keeps the nominal name so a reloaded board is still a 2x4', () => {
    const model = sampleModel();
    const parsed = parseProject(
      projectToJson({ name: 'n', units: 'imperial', boards: model.boards, constraints: [] }),
    );
    expect(parsed.boards[0]?.nominal).toBe('2x4');
  });

  it('rejects a file from a newer format rather than mangling it', () => {
    const future = JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, boards: [] });
    expect(() => parseProject(future)).toThrow(ProjectParseError);
  });

  it('rejects things that are not projects', () => {
    expect(() => parseProject('not json')).toThrow(ProjectParseError);
    expect(() => parseProject('{"hello":1}')).toThrow(ProjectParseError);
  });

  it('salvages what it can from a partly corrupt file', () => {
    const model = sampleModel();
    const raw = JSON.parse(
      projectToJson({
        name: 'n',
        units: 'imperial',
        boards: model.boards,
        constraints: model.constraints,
      }),
    ) as Record<string, unknown>;

    // A board loses its length: drop that board, and the constraints that
    // depended on it, rather than failing the entire load.
    (raw.boards as Record<string, unknown>[])[1] = { id: 'broken', label: 'oops' };

    const parsed = parseProject(JSON.stringify(raw));
    expect(parsed.boards).toHaveLength(1);
    expect(parsed.constraints).toHaveLength(1);
    expect(parsed.constraints[0]?.b).toEqual({ kind: 'ground' });
  });
});

describe('extractSubgraph', () => {
  it('keeps internal constraints and reports the ones it drops', () => {
    const model = sampleModel();
    const selection = new Set([model.plate.id, model.stud.id]);

    const result = extractSubgraph(model.boards, model.constraints, selection);
    expect(result.boards).toHaveLength(2);
    // Stud-to-plate is internal; plate-to-ground reaches outside the selection.
    expect(result.constraints).toHaveLength(1);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0]?.b).toEqual({ kind: 'ground' });
  });

  it('ignores constraints unrelated to the selection', () => {
    const model = sampleModel();
    const result = extractSubgraph(model.boards, model.constraints, new Set([model.stud.id]));
    expect(result.boards).toHaveLength(1);
    expect(result.constraints).toHaveLength(0);
    // The stud-to-plate constraint touches the selection, so it is reported.
    expect(result.dropped).toHaveLength(1);
  });
});

describe('remapIds', () => {
  it('gives fresh ids while keeping internal references intact', () => {
    const model = sampleModel();
    const copy = remapIds(model.boards, model.constraints, 'group-1');

    const originalIds = new Set(model.boards.map((board) => board.id));
    for (const board of copy.boards) {
      expect(originalIds.has(board.id)).toBe(false);
      expect(board.groupId).toBe('group-1');
    }

    // The stud-to-plate constraint must now point at the copies, not the originals.
    const side = copy.constraints[1]?.a;
    expect(side?.kind).toBe('board');
    const referenced = side?.kind === 'board' ? side.boardId : null;
    expect(referenced).not.toBeNull();
    expect(copy.boards.some((board) => board.id === referenced)).toBe(true);
    expect(originalIds.has(referenced as string)).toBe(false);
  });

  it('produces a copy that solves the same way as the original', () => {
    const model = sampleModel();
    const copy = remapIds(model.boards, model.constraints);
    const solved = resolveBoards(copy.boards, copy.constraints);

    const originalHeights = model.boards.map((board) => board.position[1]).sort((a, b) => a - b);
    const copyHeights = solved.boards.map((board) => board.position[1]).sort((a, b) => a - b);
    originalHeights.forEach((height, i) => {
      expect(copyHeights[i]).toBeCloseTo(height, 9);
    });
  });
});
