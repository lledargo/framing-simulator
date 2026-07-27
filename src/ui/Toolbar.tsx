import { useRef } from 'react';
import { ProjectParseError } from '../core/project';
import { useStore } from '../state/store';
import type { ViewName } from '../scene/controls/TrackpadControls';

interface Props {
  onSetView: (view: ViewName) => void;
  onFrameAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const VIEW_BUTTONS: ReadonlyArray<{ view: ViewName; label: string; key: string }> = [
  { view: 'iso', label: 'Iso', key: '0' },
  { view: 'front', label: 'Front', key: '1' },
  { view: 'right', label: 'Right', key: '3' },
  { view: 'top', label: 'Top', key: '5' },
];

export function Toolbar({
  onSetView,
  onFrameAll,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props): JSX.Element {
  const tool = useStore((state) => state.tool);
  const setTool = useStore((state) => state.setTool);
  const name = useStore((state) => state.name);
  const newProject = useStore((state) => state.newProject);
  const exportProjectJson = useStore((state) => state.exportProjectJson);
  const loadProjectJson = useStore((state) => state.loadProjectJson);
  const setStatus = useStore((state) => state.setStatus);

  const fileInput = useRef<HTMLInputElement>(null);

  const save = (): void => {
    const blob = new Blob([exportProjectJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name.replace(/[^\w-]+/g, '-').toLowerCase()}.frame.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const open = async (file: File): Promise<void> => {
    try {
      loadProjectJson(await file.text());
    } catch (error) {
      setStatus(
        error instanceof ProjectParseError ? error.message : 'That file could not be opened.',
      );
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar-group brand">
        <span className="logo">▤</span>
        <span className="title">Framing Simulator</span>
      </div>

      <div className="toolbar-group">
        <button
          type="button"
          className={tool === 'select' ? 'tool active' : 'tool'}
          onClick={() => setTool('select')}
          title="Select (V)"
        >
          Select
        </button>
        <button
          type="button"
          className={tool === 'constrain' ? 'tool active' : 'tool'}
          onClick={() => setTool('constrain')}
          title="Constrain (C)"
        >
          Constrain
        </button>
      </div>

      <div className="toolbar-group">
        <button type="button" onClick={onUndo} disabled={!canUndo} title="Undo">
          Undo
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} title="Redo">
          Redo
        </button>
      </div>

      <div className="toolbar-group">
        {VIEW_BUTTONS.map((button) => (
          <button
            key={button.view}
            type="button"
            onClick={() => onSetView(button.view)}
            title={`${button.label} view (${button.key})`}
          >
            {button.label}
          </button>
        ))}
        <button type="button" onClick={onFrameAll} title="Frame everything (F)">
          Frame
        </button>
      </div>

      <div className="toolbar-group right">
        <button type="button" onClick={newProject}>
          New
        </button>
        <button type="button" onClick={() => fileInput.current?.click()}>
          Open
        </button>
        <button type="button" onClick={save}>
          Save
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void open(file);
            event.target.value = '';
          }}
        />
      </div>
    </header>
  );
}
