import { Grid } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { inches } from '../core/units';

/** Contributes no intersections, so the plane is invisible to the raycaster. */
const NO_RAYCAST = (): void => {};

interface Props {
  visible: boolean;
  /** Highlighted while it is a pending or hovered constraint target. */
  highlighted: boolean;
  pickable: boolean;
  onPick: (event: ThreeEvent<MouseEvent>) => void;
  onPointerOver: () => void;
  onPointerOut: () => void;
}

/**
 * The ground grid. It is a real constraint target, not just decoration — the
 * usual first move in any frame is putting a plate flat on the floor — so it
 * needs a pickable surface, and that surface only accepts the pointer while the
 * constrain tool is active so it can't swallow clicks meant to deselect.
 */
export function Ground({
  visible,
  highlighted,
  pickable,
  onPick,
  onPointerOver,
  onPointerOut,
}: Props): JSX.Element {
  return (
    <group>
      {visible ? (
        <Grid
          args={[40_000, 40_000]}
          cellSize={inches(12)}
          cellThickness={0.6}
          cellColor="#3a4150"
          sectionSize={inches(48)}
          sectionThickness={1.2}
          sectionColor="#5c687c"
          fadeDistance={40_000}
          fadeStrength={1.5}
          followCamera={false}
          infiniteGrid
        />
      ) : null}

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        // Sits just under the grid. At exactly y=0 this plane draws over the
        // grid lines and the model looks like it is floating in empty space.
        position={[0, -2, 0]}
        receiveShadow
        // Spread rather than pass `undefined`: omitting the prop is what keeps
        // the mesh's default raycast, and under `exactOptionalPropertyTypes`
        // an explicit `undefined` is not the same as an absent prop.
        {...(pickable ? {} : { raycast: NO_RAYCAST })}
        onClick={(event) => {
          if (!pickable) return;
          event.stopPropagation();
          onPick(event);
        }}
        onPointerOver={(event) => {
          if (!pickable) return;
          event.stopPropagation();
          onPointerOver();
        }}
        onPointerOut={() => {
          if (!pickable) return;
          onPointerOut();
        }}
      >
        <planeGeometry args={[40_000, 40_000]} />
        <meshStandardMaterial
          color={highlighted ? '#2b4a63' : '#1b1e24'}
          roughness={1}
          transparent
          opacity={highlighted ? 0.85 : 0.55}
        />
      </mesh>
    </group>
  );
}
