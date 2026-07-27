import { describe, expect, it } from 'vitest';
import {
  boardFeet,
  feet,
  formatInchesFraction,
  formatLength,
  inches,
  parseLength,
} from '../src/core/units';

describe('parseLength', () => {
  it('reads a bare number in the active system', () => {
    expect(parseLength('96', 'imperial')).toBeCloseTo(2438.4, 6);
    expect(parseLength('1200', 'metric')).toBeCloseTo(1200, 6);
  });

  it('reads explicit units regardless of the active system', () => {
    expect(parseLength("8'", 'metric')).toBeCloseTo(2438.4, 6);
    expect(parseLength('1200mm', 'imperial')).toBeCloseTo(1200, 6);
    expect(parseLength('1.2m', 'imperial')).toBeCloseTo(1200, 6);
    expect(parseLength('120cm', 'imperial')).toBeCloseTo(1200, 6);
  });

  it('reads feet and inches together', () => {
    expect(parseLength(`8' 6"`, 'imperial')).toBeCloseTo(feet(8) + inches(6), 6);
    expect(parseLength(`8'6"`, 'imperial')).toBeCloseTo(feet(8) + inches(6), 6);
    expect(parseLength(`8' 6 1/2"`, 'imperial')).toBeCloseTo(feet(8) + inches(6.5), 6);
    expect(parseLength('8ft 6in', 'imperial')).toBeCloseTo(feet(8) + inches(6), 6);
  });

  it('reads fractions the way they get written on a cut list', () => {
    expect(parseLength('3/4', 'imperial')).toBeCloseTo(inches(0.75), 6);
    expect(parseLength('2 3/8', 'imperial')).toBeCloseTo(inches(2.375), 6);
    expect(parseLength('92 5/8"', 'imperial')).toBeCloseTo(inches(92.625), 6);
  });

  it('rejects nonsense rather than guessing', () => {
    expect(parseLength('', 'imperial')).toBeNull();
    expect(parseLength('abc', 'imperial')).toBeNull();
    expect(parseLength('-5', 'imperial')).toBeNull();
    expect(parseLength('3/0', 'imperial')).toBeNull();
    expect(parseLength('12 furlongs', 'imperial')).toBeNull();
  });
});

describe('formatLength', () => {
  it('round-trips the canonical 8 foot board', () => {
    const mm = parseLength("8'", 'imperial');
    expect(mm).not.toBeNull();
    expect(formatLength(mm as number, 'imperial')).toBe(`8' 0"`);
    expect(formatLength(mm as number, 'metric')).toBe('2438.4 mm');
  });

  it('splits into feet and inches past a foot', () => {
    expect(formatLength(inches(92.625), 'imperial')).toBe(`7' 8 5/8"`);
    expect(formatLength(inches(3.5), 'imperial')).toBe(`3 1/2"`);
  });

  it('never reports twelve inches of remainder', () => {
    // 95.999" must read as 8' 0", not 7' 12".
    expect(formatLength(inches(95.999), 'imperial')).toBe(`8' 0"`);
  });

  it('reduces fractions to lowest terms', () => {
    expect(formatInchesFraction(3.5)).toBe('3 1/2');
    expect(formatInchesFraction(0.75)).toBe('3/4');
    expect(formatInchesFraction(5.0625)).toBe('5 1/16');
    expect(formatInchesFraction(7)).toBe('7');
  });
});

describe('boardFeet', () => {
  it('computes the standard measure', () => {
    // A 1" x 12" x 12" piece is exactly one board foot.
    expect(boardFeet(inches(12), inches(1), inches(12))).toBeCloseTo(1, 6);
    // An 8ft 2x4: 1.5 * 3.5 * 96 / 144
    expect(boardFeet(inches(3.5), inches(1.5), feet(8))).toBeCloseTo(3.5, 6);
  });
});
