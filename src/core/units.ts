/**
 * Length handling.
 *
 * Everything inside the app is millimetres (float64). Display and input are
 * whatever the user picked. Imperial is the awkward one: people type `8'`,
 * `8' 6"`, `2 3/8`, `96`, and expect all of them to work, and they expect to
 * read back fractions rather than 3.7362 inches.
 */

import type { UnitSystem } from './types';

export type { UnitSystem };

export const MM_PER_INCH = 25.4;
export const MM_PER_FOOT = 304.8;

export const inches = (n: number): number => n * MM_PER_INCH;
export const feet = (n: number): number => n * MM_PER_FOOT;
export const toInches = (mm: number): number => mm / MM_PER_INCH;

/** Denominator imperial output is rounded to. 1/16" is the shop standard. */
export const IMPERIAL_DENOMINATOR = 16;

const UNIT_SUFFIXES: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(?:mm|millimet(?:er|re)s?)$/i, 1],
  [/^(?:cm|centimet(?:er|re)s?)$/i, 10],
  [/^(?:m|met(?:er|re)s?)$/i, 1000],
  [/^(?:"|in|ins|inch|inches)$/i, MM_PER_INCH],
  [/^(?:'|ft|foot|feet)$/i, MM_PER_FOOT],
];

function suffixToMm(suffix: string): number | null {
  const trimmed = suffix.trim();
  if (trimmed === '') return null;
  for (const [pattern, factor] of UNIT_SUFFIXES) {
    if (pattern.test(trimmed)) return factor;
  }
  return null;
}

/** `3`, `3.5`, `3/4`, `2 3/8` -> a number. Returns null if it isn't one of those. */
function parseMixedNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(trimmed);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den === 0) return null;
    return whole + num / den;
  }

  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(trimmed);
  if (fraction) {
    const den = Number(fraction[2]);
    if (den === 0) return null;
    return Number(fraction[1]) / den;
  }

  const plain = /^\d*\.?\d+$/.exec(trimmed);
  if (plain) return Number(trimmed);

  return null;
}

/**
 * Parse a user-typed length into millimetres.
 *
 * A bare number means inches in imperial and millimetres in metric. Anything
 * with an explicit unit is taken at its word regardless of the active system,
 * so someone working in metric can still type `8'` and get 2438.4.
 *
 * Returns null on anything it can't make sense of; callers show a field error
 * rather than silently substituting a number the user didn't ask for.
 */
export function parseLength(input: string, system: UnitSystem): number | null {
  const text = input.trim().toLowerCase();
  if (text === '') return null;

  // Negative lengths are never meaningful here.
  if (text.startsWith('-')) return null;

  // Feet-and-inches: 8'6", 8' 6 1/2", 8ft 6in. The inch part is optional.
  const feetInches = /^([\d.]+)\s*(?:'|ft|feet|foot)\s*(.*)$/.exec(text);
  if (feetInches) {
    const ft = Number(feetInches[1]);
    if (!Number.isFinite(ft)) return null;
    const rest = (feetInches[2] ?? '').replace(/(?:"|in|ins|inch|inches)\s*$/i, '').trim();
    if (rest === '') return feet(ft);
    const inchPart = parseMixedNumber(rest);
    if (inchPart === null) return null;
    return feet(ft) + inches(inchPart);
  }

  // <number><unit>, where the number may be a mixed fraction: `2 3/8"`, `1200 mm`.
  const withSuffix = /^([\d.\s/]+?)\s*([a-z"']+)$/.exec(text);
  if (withSuffix) {
    const value = parseMixedNumber(withSuffix[1] ?? '');
    const factor = suffixToMm(withSuffix[2] ?? '');
    if (value === null || factor === null) return null;
    return value * factor;
  }

  const bare = parseMixedNumber(text);
  if (bare === null) return null;
  return system === 'imperial' ? inches(bare) : bare;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/**
 * Format inches as a shop-readable fraction, e.g. 3.5 -> `3 1/2`, 0.75 -> `3/4`.
 * Rounds to `denominator`; values that land on a whole number lose the fraction.
 */
export function formatInchesFraction(value: number, denominator = IMPERIAL_DENOMINATOR): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);

  const totalSixteenths = Math.round(abs * denominator);
  const whole = Math.floor(totalSixteenths / denominator);
  let numerator = totalSixteenths - whole * denominator;

  if (numerator === 0) return `${sign}${whole}`;

  let den = denominator;
  const divisor = greatestCommonDivisor(numerator, den);
  numerator /= divisor;
  den /= divisor;

  return whole === 0 ? `${sign}${numerator}/${den}` : `${sign}${whole} ${numerator}/${den}`;
}

export interface FormatOptions {
  /** Imperial only: break into feet and inches once past 12". Defaults to true. */
  feetInches?: boolean;
  /** Append the unit symbol. Defaults to true. */
  withUnit?: boolean;
  /** Metric only: decimal places. Defaults to 1, trailing zeros trimmed. */
  precision?: number;
}

/** Render millimetres for display in the active system. */
export function formatLength(mm: number, system: UnitSystem, options: FormatOptions = {}): string {
  const { feetInches = true, withUnit = true, precision = 1 } = options;

  if (system === 'metric') {
    const rounded = Number(mm.toFixed(precision));
    return withUnit ? `${rounded} mm` : String(rounded);
  }

  const totalInches = toInches(mm);

  // Round before splitting, so 95.999" reads as 8' 0" and never 7' 12".
  const sixteenths = Math.round(totalInches * IMPERIAL_DENOMINATOR);
  const roundedInches = sixteenths / IMPERIAL_DENOMINATOR;

  if (!feetInches || roundedInches < 12) {
    const body = formatInchesFraction(roundedInches);
    return withUnit ? `${body}"` : body;
  }

  const ft = Math.floor(roundedInches / 12);
  const remainder = roundedInches - ft * 12;
  const inchBody = formatInchesFraction(remainder);

  if (!withUnit) return remainder === 0 ? `${ft}'` : `${ft}' ${inchBody}`;
  return remainder === 0 ? `${ft}' 0"` : `${ft}' ${inchBody}"`;
}

/** Compact form for dense tables — no feet/inches split, no unit symbol. */
export function formatLengthShort(mm: number, system: UnitSystem): string {
  return formatLength(mm, system, { feetInches: false, withUnit: false });
}

/** Board feet: the US volume measure for lumber. 1 bf = 144 cubic inches. */
export function boardFeet(widthMm: number, thicknessMm: number, lengthMm: number): number {
  return (toInches(widthMm) * toInches(thicknessMm) * toInches(lengthMm)) / 144;
}
