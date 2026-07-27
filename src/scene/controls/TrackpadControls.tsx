import { useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { Ref } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import CameraControls from 'camera-controls';
import * as THREE from 'three';
import { CONTROL_PRESETS, gestureFor } from './inputMap';
import type { ControlPresetId } from './inputMap';

// camera-controls ships tree-shakeable: it wants the subset of three it uses.
CameraControls.install({ THREE });

export interface CameraApi {
  frame: (box: THREE.Box3 | null) => void;
  setView: (view: ViewName) => void;
}

export type ViewName = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'iso';

/**
 * Starting camera: a true 35-degree isometric aimed at the origin, where new
 * boards land. A shallower angle looks tidier on an empty scene but shows flat
 * lumber almost edge-on, which makes the top face nearly impossible to click.
 */
const HOME_VIEW = [3200, 3400, 3200, 0, 200, 0] as const;

const VIEW_DIRECTIONS: Record<ViewName, [number, number, number]> = {
  top: [0, 1, 0.0001],
  bottom: [0, -1, 0.0001],
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  iso: [1, 0.8, 1],
};

interface Props {
  presetId: ControlPresetId;
  apiRef?: Ref<CameraApi>;
}

export function TrackpadControls({ presetId, apiRef }: Props): JSX.Element | null {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const controls = useMemo(() => new CameraControls(camera, gl.domElement), [camera, gl]);
  const presetRef = useRef(presetId);
  presetRef.current = presetId;

  useEffect(() => {
    controls.dollyToCursor = true;
    controls.minDistance = 100;
    controls.maxDistance = 200_000;
    // Stop the orbit passing under the ground plane, where the grid z-fights
    // and the model reads as upside down.
    controls.maxPolarAngle = Math.PI / 2 - 0.01;
    controls.smoothTime = 0.08;
    controls.draggingSmoothTime = 0.04;

    // Left drag is reserved for picking and moving boards, so the camera takes
    // the buttons a trackpad user can still reach without one.
    controls.mouseButtons.left = CameraControls.ACTION.NONE;
    controls.mouseButtons.middle = CameraControls.ACTION.TRUCK;
    controls.mouseButtons.right = CameraControls.ACTION.ROTATE;
    controls.mouseButtons.wheel = CameraControls.ACTION.NONE;

    // Touch: one finger orbits, two pan and pinch-zoom.
    controls.touches.one = CameraControls.ACTION.TOUCH_ROTATE;
    controls.touches.two = CameraControls.ACTION.TOUCH_DOLLY_TRUCK;
    controls.touches.three = CameraControls.ACTION.TOUCH_TRUCK;

    controls.setLookAt(...HOME_VIEW, false);

    return () => controls.dispose();
  }, [controls]);

  /**
   * Wheel handling is taken over entirely rather than configured, because
   * camera-controls only ever maps the wheel to one action and this app needs
   * three depending on modifiers.
   */
  useEffect(() => {
    const element = gl.domElement;

    const onWheel = (event: WheelEvent): void => {
      // Unconditional: without this a horizontal two-finger scroll triggers
      // browser back-navigation, and a pinch zooms the document.
      event.preventDefault();

      const preset = CONTROL_PRESETS[presetRef.current];
      const { gesture, sensitivity } = gestureFor(preset, event);
      if (gesture === 'none') return;

      const { deltaX, deltaY } = event;

      if (gesture === 'orbit') {
        controls.rotate(-deltaX * sensitivity.orbit, -deltaY * sensitivity.orbit, true);
        return;
      }

      if (gesture === 'pan') {
        // Pan in world units proportional to how far away the camera is, so the
        // model tracks the fingers at any zoom level.
        const scale = controls.distance * 0.0015 * sensitivity.pan;
        controls.truck(deltaX * scale, -deltaY * scale, true);
        return;
      }

      const rect = element.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      // dollyToCursor uses the last pointer position, so tell it where we are.
      controls.dollyToCursor = true;
      (controls as unknown as { _dollyControlCoord: THREE.Vector2 })._dollyControlCoord?.set(x, y);
      controls.dolly(-deltaY * controls.distance * sensitivity.zoom, true);
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [controls, gl]);

  useImperativeHandle(
    apiRef,
    (): CameraApi => ({
      frame: (box) => {
        if (!box || box.isEmpty()) {
          void controls.setLookAt(...HOME_VIEW, true);
          return;
        }
        void controls.fitToBox(box, true, {
          paddingTop: 300,
          paddingBottom: 300,
          paddingLeft: 300,
          paddingRight: 300,
        });
      },
      setView: (view) => {
        const [dx, dy, dz] = VIEW_DIRECTIONS[view];
        const target = new THREE.Vector3();
        controls.getTarget(target);
        const distance = controls.distance;
        void controls.setLookAt(
          target.x + dx * distance,
          target.y + dy * distance,
          target.z + dz * distance,
          target.x,
          target.y,
          target.z,
          true,
        );
      },
    }),
    [controls],
  );

  useFrame((_, delta) => {
    controls.update(delta);
  });

  return null;
}
