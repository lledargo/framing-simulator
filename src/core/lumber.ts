import { feet, inches } from './units';
import type { Section, UnitSystem } from './types';

/**
 * Stock lumber catalogues.
 *
 * The nominal/actual gap is the thing that trips people up: a "2x4" has been
 * 1 1/2" x 3 1/2" since the surfacing standards of the 1960s, and a cut list
 * that reports nominal dimensions is a cut list that produces a wall an inch
 * short. Only actual dimensions are ever stored; nominal names are labels.
 */

export interface LumberPreset {
  id: string;
  label: string;
  section: Section;
  system: UnitSystem;
}

const imperial = (id: string, thicknessIn: number, widthIn: number): LumberPreset => ({
  id,
  label: id,
  section: { thickness: inches(thicknessIn), width: inches(widthIn) },
  system: 'imperial',
});

const metric = (id: string, thicknessMm: number, widthMm: number): LumberPreset => ({
  id,
  label: id,
  section: { thickness: thicknessMm, width: widthMm },
  system: 'metric',
});

/** US dimensional lumber: nominal name, actual surfaced size. */
export const IMPERIAL_PRESETS: readonly LumberPreset[] = [
  imperial('1x4', 0.75, 3.5),
  imperial('1x6', 0.75, 5.5),
  imperial('2x2', 1.5, 1.5),
  imperial('2x3', 1.5, 2.5),
  imperial('2x4', 1.5, 3.5),
  imperial('2x6', 1.5, 5.5),
  imperial('2x8', 1.5, 7.25),
  imperial('2x10', 1.5, 9.25),
  imperial('2x12', 1.5, 11.25),
  imperial('4x4', 3.5, 3.5),
  imperial('4x6', 3.5, 5.5),
  imperial('6x6', 5.5, 5.5),
];

/** Common European/Australasian sawn and regularised sizes. */
export const METRIC_PRESETS: readonly LumberPreset[] = [
  metric('45x70', 45, 70),
  metric('45x90', 45, 90),
  metric('45x120', 45, 120),
  metric('45x145', 45, 145),
  metric('45x195', 45, 195),
  metric('45x245', 45, 245),
  metric('90x90', 90, 90),
];

export const ALL_PRESETS: readonly LumberPreset[] = [...IMPERIAL_PRESETS, ...METRIC_PRESETS];

export function presetsFor(system: UnitSystem): readonly LumberPreset[] {
  return system === 'imperial' ? IMPERIAL_PRESETS : METRIC_PRESETS;
}

export function findPreset(id: string): LumberPreset | undefined {
  return ALL_PRESETS.find((preset) => preset.id === id);
}

/** Lengths lumber is actually sold in — the basis for the Phase 7 cut optimiser. */
export const IMPERIAL_STOCK_LENGTHS: readonly number[] = [
  feet(8),
  feet(10),
  feet(12),
  feet(14),
  feet(16),
  feet(20),
];

export const METRIC_STOCK_LENGTHS: readonly number[] = [2400, 3000, 3600, 4200, 4800, 6000];

export function stockLengthsFor(system: UnitSystem): readonly number[] {
  return system === 'imperial' ? IMPERIAL_STOCK_LENGTHS : METRIC_STOCK_LENGTHS;
}

/**
 * On-centre spacings for the array tool. 19.2" is the oddity: it is one sixth
 * of 96", so it still lands on sheet-goods joints.
 */
export interface SpacingPreset {
  id: string;
  label: string;
  value: number;
  system: UnitSystem;
}

export const SPACING_PRESETS: readonly SpacingPreset[] = [
  { id: 'oc-12', label: '12" o.c.', value: inches(12), system: 'imperial' },
  { id: 'oc-16', label: '16" o.c.', value: inches(16), system: 'imperial' },
  { id: 'oc-19', label: '19.2" o.c.', value: inches(19.2), system: 'imperial' },
  { id: 'oc-24', label: '24" o.c.', value: inches(24), system: 'imperial' },
  { id: 'oc-300', label: '300 mm o.c.', value: 300, system: 'metric' },
  { id: 'oc-400', label: '400 mm o.c.', value: 400, system: 'metric' },
  { id: 'oc-600', label: '600 mm o.c.', value: 600, system: 'metric' },
];

export function spacingsFor(system: UnitSystem): readonly SpacingPreset[] {
  return SPACING_PRESETS.filter((spacing) => spacing.system === system);
}

/** Default length offered when adding a board, by system. */
export function defaultLength(system: UnitSystem): number {
  return system === 'imperial' ? feet(8) : 2400;
}
