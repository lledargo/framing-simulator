import { useCallback, useEffect, useRef, useState } from 'react';
import { Viewport } from './scene/Viewport';
import type { CameraApi, ViewName } from './scene/controls/TrackpadControls';
import { modelBounds } from './scene/picking';
import { BoardInspector } from './ui/BoardInspector';
import { BoardPalette } from './ui/BoardPalette';
import { ConstraintPanel } from './ui/ConstraintPanel';
import { CutListPanel } from './ui/CutListPanel';
import { SettingsPanel } from './ui/SettingsPanel';
import { Toolbar } from './ui/Toolbar';
import { resolveAfterHistory, useStore } from './state/store';
import { useAutosave } from './state/autosave';

type TabId = 'add' | 'board' | 'constraints' | 'cutlist' | 'settings';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'add', label: 'Add' },
  { id: 'board', label: 'Board' },
  { id: 'constraints', label: 'Constraints' },
  { id: 'cutlist', label: 'Cut list' },
  { id: 'settings', label: 'Settings' },
];

const VIEW_KEYS: Record<string, ViewName> = {
  '1': 'front',
  '2': 'back',
  '3': 'right',
  '4': 'left',
  '5': 'top',
  '6': 'bottom',
  '0': 'iso',
};

export function App(): JSX.Element {
  const cameraRef = useRef<CameraApi>(null);
  const [tab, setTab] = useState<TabId>('add');

  const tool = useStore((state) => state.tool);
  const setTool = useStore((state) => state.setTool);
  const selection = useStore((state) => state.selection);
  const statusMessage = useStore((state) => state.statusMessage);
  const pendingPick = useStore((state) => state.pendingPick);
  const cancelPick = useStore((state) => state.cancelPick);
  const deleteBoards = useStore((state) => state.deleteBoards);

  useAutosave();

  const undo = useStore.temporal.getState().undo;
  const redo = useStore.temporal.getState().redo;
  const [history, setHistory] = useState({ past: 0, future: 0 });

  useEffect(
    () =>
      useStore.temporal.subscribe((state) =>
        setHistory({ past: state.pastStates.length, future: state.futureStates.length }),
      ),
    [],
  );

  const doUndo = useCallback(() => {
    undo();
    // History stores the model only, so positions have to be recomputed.
    resolveAfterHistory();
  }, [undo]);

  const doRedo = useCallback(() => {
    redo();
    resolveAfterHistory();
  }, [redo]);

  const frameAll = useCallback(() => {
    cameraRef.current?.frame(modelBounds(useStore.getState().boards));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      // Never steal keys from a field the user is typing in.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) doRedo();
        else doUndo();
        return;
      }

      const view = VIEW_KEYS[event.key];
      if (view) {
        cameraRef.current?.setView(view);
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'f':
          frameAll();
          break;
        case 'c':
          setTool('constrain');
          setTab('constraints');
          break;
        case 'v':
          setTool('select');
          break;
        case 'escape':
          cancelPick();
          break;
        case 'delete':
        case 'backspace':
          if (selection.length > 0) {
            event.preventDefault();
            deleteBoards(selection);
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [doUndo, doRedo, frameAll, setTool, cancelPick, deleteBoards, selection]);

  const hint =
    tool === 'constrain'
      ? pendingPick
        ? 'Now click the surface it should meet. Esc cancels.'
        : 'Click a board face, edge or end — or the ground grid — to start a constraint.'
      : null;

  return (
    <div className="app">
      <Toolbar
        onSetView={(view) => cameraRef.current?.setView(view)}
        onFrameAll={frameAll}
        onUndo={doUndo}
        onRedo={doRedo}
        canUndo={history.past > 0}
        canRedo={history.future > 0}
      />

      <main className="workspace">
        <section className="viewport">
          <Viewport cameraRef={cameraRef} />
          {hint || statusMessage ? (
            <div className={`status ${pendingPick ? 'active' : ''}`}>
              {hint ?? statusMessage}
              {hint && statusMessage ? <span className="status-sub">{statusMessage}</span> : null}
            </div>
          ) : null}
        </section>

        <aside className="sidebar">
          <nav className="tabs">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={tab === entry.id ? 'tab active' : 'tab'}
                onClick={() => setTab(entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="panel">
            {tab === 'add' ? <BoardPalette /> : null}
            {tab === 'board' ? <BoardInspector /> : null}
            {tab === 'constraints' ? <ConstraintPanel /> : null}
            {tab === 'cutlist' ? <CutListPanel /> : null}
            {tab === 'settings' ? <SettingsPanel /> : null}
          </div>
        </aside>
      </main>
    </div>
  );
}
