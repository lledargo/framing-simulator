/**
 * Camera input mapping.
 *
 * The brief asks for a trackpad-friendly app, which rules out the usual web-3D
 * assumption that a middle mouse button exists. Every gesture here is reachable
 * with two fingers and a modifier key.
 *
 * The one piece of browser trivia this all rests on: a trackpad pinch arrives
 * as a `wheel` event with `ctrlKey` set, synthesised by the OS. It is
 * indistinguishable from a real Ctrl+scroll, which is exactly why the page must
 * call `preventDefault` on it — otherwise the browser zooms the whole document
 * out from under the canvas.
 */

export type Gesture = 'orbit' | 'pan' | 'zoom' | 'none';

export interface ControlPreset {
  id: ControlPresetId;
  label: string;
  description: string;
  /** Two-finger scroll with no modifier. */
  scroll: Gesture;
  shiftScroll: Gesture;
  /** Pinch, i.e. wheel with ctrlKey. Always zoom in practice, but explicit. */
  pinch: Gesture;
  /** Left-button drag on empty space. */
  drag: Gesture;
  shiftDrag: Gesture;
}

export type ControlPresetId = 'sketchup' | 'fusion' | 'blender' | 'classic';

export const CONTROL_PRESETS: Record<ControlPresetId, ControlPreset> = {
  sketchup: {
    id: 'sketchup',
    label: 'SketchUp-like',
    description: 'Two-finger scroll orbits, Shift pans, pinch zooms.',
    scroll: 'orbit',
    shiftScroll: 'pan',
    pinch: 'zoom',
    drag: 'orbit',
    shiftDrag: 'pan',
  },
  fusion: {
    id: 'fusion',
    label: 'Fusion-like',
    description: 'Two-finger scroll pans, Shift orbits, pinch zooms.',
    scroll: 'pan',
    shiftScroll: 'orbit',
    pinch: 'zoom',
    drag: 'pan',
    shiftDrag: 'orbit',
  },
  blender: {
    id: 'blender',
    label: 'Blender-like',
    description: 'Two-finger scroll orbits, Shift pans, scroll wheel zooms.',
    scroll: 'orbit',
    shiftScroll: 'pan',
    pinch: 'zoom',
    drag: 'orbit',
    shiftDrag: 'pan',
  },
  classic: {
    id: 'classic',
    label: 'Classic web 3D',
    description: 'Scroll zooms, drag orbits, Shift-drag pans.',
    scroll: 'zoom',
    shiftScroll: 'pan',
    pinch: 'zoom',
    drag: 'orbit',
    shiftDrag: 'pan',
  },
};

export const CONTROL_PRESET_LIST: readonly ControlPreset[] = Object.values(CONTROL_PRESETS);

/**
 * Guess whether a wheel event came from a trackpad.
 *
 * Mice report line-based deltas, or pixel deltas in coarse multiples of ~100.
 * Trackpads report small, often fractional pixel deltas, and produce horizontal
 * deltas that a wheel physically cannot. This only picks default sensitivities;
 * getting it wrong makes the camera fast or slow, never broken.
 */
export function looksLikeTrackpad(event: WheelEvent): boolean {
  if (event.deltaMode !== 0) return false;
  if (event.deltaX !== 0 && Math.abs(event.deltaX) < 40) return true;
  if (!Number.isInteger(event.deltaY)) return true;
  return Math.abs(event.deltaY) < 40;
}

export interface Sensitivity {
  orbit: number;
  pan: number;
  zoom: number;
}

/**
 * A trackpad flick delivers many small events where a mouse notch delivers one
 * big one, so the two need different scale factors to feel the same.
 */
export const TRACKPAD_SENSITIVITY: Sensitivity = { orbit: 0.006, pan: 1.1, zoom: 0.012 };
export const MOUSE_SENSITIVITY: Sensitivity = { orbit: 0.0035, pan: 1.0, zoom: 0.0022 };

export function gestureFor(
  preset: ControlPreset,
  event: WheelEvent,
): { gesture: Gesture; sensitivity: Sensitivity } {
  const sensitivity = looksLikeTrackpad(event) ? TRACKPAD_SENSITIVITY : MOUSE_SENSITIVITY;

  // Pinch first: the OS sets ctrlKey for it, and it always means zoom.
  if (event.ctrlKey || event.metaKey) return { gesture: preset.pinch, sensitivity };
  if (event.shiftKey) return { gesture: preset.shiftScroll, sensitivity };

  // A real wheel under the Blender preset should still zoom; only a trackpad's
  // two-finger scroll orbits.
  if (preset.id === 'blender' && !looksLikeTrackpad(event)) {
    return { gesture: 'zoom', sensitivity };
  }

  return { gesture: preset.scroll, sensitivity };
}
