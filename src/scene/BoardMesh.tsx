import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { Board, FeatureName } from '../core/types';
import { boardMatrix, faceQuad, featureFromIntersection } from './picking';

/** Wood-ish tones, varied a little by section so a wall reads as parts. */
const BASE_COLOR = '#c8a06a';
const SELECTED_COLOR = '#e8b563';
const HOVER_COLOR = '#d9ae76';
const CONFLICT_COLOR = '#d4726a';

interface Props {
  board: Board;
  selected: boolean;
  hovered: boolean;
  conflicted: boolean;
  /** The surface to highlight, if any — hover target or a pending pick. */
  highlightFeature: FeatureName | null;
  highlightColor: string;
  onPointerOver: (boardId: string, feature: FeatureName | null) => void;
  onPointerOut: (boardId: string) => void;
  onClick: (event: ThreeEvent<MouseEvent>, boardId: string, feature: FeatureName | null) => void;
}

export function BoardMesh({
  board,
  selected,
  hovered,
  conflicted,
  highlightFeature,
  highlightColor,
  onPointerOver,
  onPointerOut,
  onClick,
}: Props): JSX.Element {
  const groupRef = useRef<THREE.Group>(null);

  const matrix = useMemo(() => boardMatrix(board), [board]);

  const color = conflicted
    ? CONFLICT_COLOR
    : selected
      ? SELECTED_COLOR
      : hovered
        ? HOVER_COLOR
        : BASE_COLOR;

  const quad = highlightFeature ? faceQuad(board, highlightFeature) : null;

  return (
    <group ref={groupRef} matrix={matrix} matrixAutoUpdate={false}>
      <mesh
        castShadow
        receiveShadow
        onPointerOver={(event) => {
          event.stopPropagation();
          onPointerOver(board.id, featureFromIntersection(event));
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          onPointerOver(board.id, featureFromIntersection(event));
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          onPointerOut(board.id);
        }}
        onClick={(event) => {
          event.stopPropagation();
          onClick(event, board.id, featureFromIntersection(event));
        }}
      >
        <boxGeometry args={[board.length, board.section.width, board.section.thickness]} />
        <meshStandardMaterial color={color} roughness={0.85} metalness={0.02} />
        <Edges threshold={15} color={selected ? '#3d2a12' : '#8a6b42'} />
      </mesh>

      {quad ? (
        <mesh
          position={[quad.position[0], quad.position[1], quad.position[2]]}
          rotation={[quad.rotation[0], quad.rotation[1], quad.rotation[2]]}
          raycast={() => null}
        >
          <planeGeometry args={[quad.size[0], quad.size[1]]} />
          <meshBasicMaterial
            color={highlightColor}
            transparent
            opacity={0.55}
            side={THREE.DoubleSide}
            depthTest={false}
            polygonOffset
            polygonOffsetFactor={-4}
          />
        </mesh>
      ) : null}
    </group>
  );
}
