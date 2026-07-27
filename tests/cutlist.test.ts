import { describe, expect, it } from 'vitest';
import { boardFromPreset } from '../src/core/board';
import { buildCutList, cutListToCsv, formatTotalRun } from '../src/core/cutlist';
import { findPreset } from '../src/core/lumber';
import { feet, inches } from '../src/core/units';

const twoByFour = findPreset('2x4');
const twoBySix = findPreset('2x6');
if (!twoByFour || !twoBySix) throw new Error('presets missing');

describe('buildCutList', () => {
  it('collapses identical pieces into one row with a quantity', () => {
    const boards = [
      boardFromPreset(twoByFour, feet(8), 'A'),
      boardFromPreset(twoByFour, feet(8), 'B'),
      boardFromPreset(twoByFour, feet(8), 'C'),
    ];

    const cutList = buildCutList(boards, 'imperial');
    expect(cutList.rows).toHaveLength(1);
    expect(cutList.rows[0]?.quantity).toBe(3);
    expect(cutList.rows[0]?.nominal).toBe('2x4');
    expect(cutList.totals.pieces).toBe(3);
  });

  it('keeps different lengths and sections apart', () => {
    const boards = [
      boardFromPreset(twoByFour, feet(8), 'A'),
      boardFromPreset(twoByFour, feet(10), 'B'),
      boardFromPreset(twoBySix, feet(8), 'C'),
    ];

    const cutList = buildCutList(boards, 'imperial');
    expect(cutList.rows).toHaveLength(3);
    // Widest section leads.
    expect(cutList.rows[0]?.nominal).toBe('2x6');
  });

  it('does not split a group over floating point noise', () => {
    const exact = boardFromPreset(twoByFour, inches(92.625), 'A');
    const noisy = { ...boardFromPreset(twoByFour, inches(92.625) + 1e-9, 'B') };

    const cutList = buildCutList([exact, noisy], 'imperial');
    expect(cutList.rows).toHaveLength(1);
    expect(cutList.rows[0]?.quantity).toBe(2);
  });

  it('totals board feet across the model', () => {
    const boards = [boardFromPreset(twoByFour, feet(8), 'A'), boardFromPreset(twoByFour, feet(8), 'B')];
    const cutList = buildCutList(boards, 'imperial');
    // Each 8ft 2x4 is 3.5 board feet.
    expect(cutList.totals.totalBoardFeet).toBeCloseTo(7, 4);
  });

  it('labels a board with no preset by its actual size', () => {
    const custom = boardFromPreset(twoByFour, feet(8), 'A');
    const { nominal, ...withoutNominal } = custom;
    void nominal;
    const cutList = buildCutList([withoutNominal], 'imperial');
    expect(cutList.rows[0]?.nominal).toBe('1 1/2 x 3 1/2');
  });
});

describe('formatTotalRun', () => {
  it('reports feet for imperial and metres for metric', () => {
    expect(formatTotalRun(feet(24), 'imperial')).toBe('24.00 ft');
    expect(formatTotalRun(2400, 'metric')).toBe('2.40 m');
  });
});

describe('cutListToCsv', () => {
  it('emits a header, one line per row, and a total', () => {
    const boards = [boardFromPreset(twoByFour, feet(8), 'A'), boardFromPreset(twoBySix, feet(10), 'B')];
    const csv = cutListToCsv(buildCutList(boards, 'imperial'), 'imperial');
    const lines = csv.split('\n');

    expect(lines[0]).toContain('Section');
    expect(lines[1]).toContain('2x6');
    expect(lines[2]).toContain('2x4');
    expect(lines.at(-1)).toContain('TOTAL');
  });

  it('quotes cells that contain the delimiter', () => {
    const a = { ...boardFromPreset(twoByFour, feet(8), 'Header, joist') };
    const b = { ...boardFromPreset(twoByFour, feet(8), 'Plain') };
    const csv = cutListToCsv(buildCutList([a, b], 'imperial'), 'imperial');
    expect(csv).toContain('"Header, joist; Plain"');
  });
});
