import { orientationPreset } from '../src/core/geometry';
import { findPreset } from '../src/core/lumber';
import type { LumberPreset } from '../src/core/lumber';
import type { Basis } from '../src/core/types';

/**
 * Fixture lookups that throw instead of returning `undefined`.
 *
 * A plain `const p = findPreset('2x4'); if (!p) throw` does not narrow inside a
 * hoisted function declaration, so every call site would need a `!`. Throwing
 * behind a function boundary keeps the tests free of non-null assertions.
 */
export function requirePreset(id: string): LumberPreset {
  const preset = findPreset(id);
  if (!preset) throw new Error(`Missing lumber preset: ${id}`);
  return preset;
}

export function requireOrientation(id: string): Basis {
  const preset = orientationPreset(id);
  if (!preset) throw new Error(`Missing orientation preset: ${id}`);
  return preset.basis;
}
