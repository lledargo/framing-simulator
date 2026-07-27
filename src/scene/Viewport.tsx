import { useCallback, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { useStore } from '../state/store';
import type { FeatureName } from '../core/types';
import { boardRef, groundRef, refId } from '../core/types';
import { BoardMesh } from './BoardMesh';
import { Ground } from './Ground';
import { TrackpadControls } from './controls/TrackpadControls';
import type { CameraApi } from './controls/TrackpadControls';

const PICK_COLOR = '#4fa3ff';
const PENDING_COLOR = '#57d98a';

interface HoverTarget {
  boardId: string;
  feature: FeatureName | null;
}

interface Props {
  cameraRef: RefObject<CameraApi>;
}

export function Viewport({ cameraRef }: Props): JSX.Element {
  const boards = useStore((state) => state.boards);
  const selection = useStore((state) => state.selection);
  const tool = useStore((state) => state.tool);
  const pendingPick = useStore((state) => state.pendingPick);
  const conflicts = useStore((state) => state.solve.conflicts);
  const constraints = useStore((state) => state.constraints);
  const settings = useStore((state) => state.settings);

  const setHovered = useStore((state) => state.setHovered);
  const setSelection = useStore((state) => state.setSelection);
  const toggleSelection = useStore((state) => state.toggleSelection);
  const pickFeature = useStore((state) => state.pickFeature);

  /**
   * Hover lives in local component state, not the store: it changes on every
   * pointer move, and putting it in the store would push undo entries and
   * re-run the solver for nothing.
   */
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [groundHovered, setGroundHovered] = useState(false);

  const conflictedBoards = useMemo(() => {
    const ids = new Set<string>();
    for (const constraint of constraints) {
      if (!conflicts.has(constraint.id)) continue;
      for (const ref of [constraint.a, constraint.b]) {
        if (ref.kind === 'board') ids.add(refId(ref));
      }
    }
    return ids;
  }, [constraints, conflicts]);

  const selectionSet = useMemo(() => new Set(selection), [selection]);

  const handlePointerOver = useCallback(
    (boardId: string, feature: FeatureName | null) => {
      setHover((current) =>
        current?.boardId === boardId && current.feature === feature
          ? current
          : { boardId, feature },
      );
      setHovered(boardId);
    },
    [setHovered],
  );

  const handlePointerOut = useCallback(() => {
    setHover(null);
    setHovered(null);
  }, [setHovered]);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>, boardId: string, feature: FeatureName | null) => {
      if (tool === 'constrain') {
        if (feature) pickFeature(boardRef(boardId, feature));
        return;
      }
      if (event.shiftKey || event.metaKey) toggleSelection(boardId);
      else setSelection([boardId]);
    },
    [tool, pickFeature, setSelection, toggleSelection],
  );

  const handleMissed = useCallback(() => {
    if (tool === 'select') setSelection([]);
  }, [tool, setSelection]);

  const pendingBoardId = pendingPick?.ref.kind === 'board' ? pendingPick.ref.boardId : null;
  const pendingFeature = pendingPick?.ref.kind === 'board' ? pendingPick.ref.feature : null;
  const groundPending = pendingPick?.ref.kind === 'ground';

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 40, near: 10, far: 500_000, position: [4000, 3000, 5000] }}
      onPointerMissed={handleMissed}
      // `touch-action: none` is load-bearing: without it the browser claims
      // two-finger gestures before the wheel handler ever runs.
      style={{ touchAction: 'none', overscrollBehavior: 'none' }}
    >
      <color attach="background" args={['#15171c']} />
      <hemisphereLight intensity={0.55} groundColor="#2a2622" />
      <directionalLight
        castShadow
        position={[3000, 6000, 4000]}
        intensity={1.5}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8000}
        shadow-camera-right={8000}
        shadow-camera-top={8000}
        shadow-camera-bottom={-8000}
        shadow-camera-far={30000}
      />
      <directionalLight position={[-4000, 2000, -3000]} intensity={0.3} />

      <Ground
        visible={settings.showGrid}
        highlighted={groundPending || groundHovered}
        pickable={tool === 'constrain'}
        onPick={() => pickFeature(groundRef())}
        onPointerOver={() => setGroundHovered(true)}
        onPointerOut={() => setGroundHovered(false)}
      />

      {boards.map((board) => {
        const isPending = board.id === pendingBoardId;
        const isHovered = hover?.boardId === board.id;
        // Only show which surface is under the cursor when a surface is what
        // the click will actually act on.
        const highlightFeature = isPending
          ? pendingFeature
          : isHovered && tool === 'constrain'
            ? (hover?.feature ?? null)
            : null;

        return (
          <BoardMesh
            key={board.id}
            board={board}
            selected={selectionSet.has(board.id)}
            hovered={isHovered}
            conflicted={conflictedBoards.has(board.id)}
            highlightFeature={highlightFeature}
            highlightColor={isPending ? PENDING_COLOR : PICK_COLOR}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
            onClick={handleClick}
          />
        );
      })}

      <TrackpadControls presetId={settings.controlPreset} apiRef={cameraRef} />
    </Canvas>
  );
}
