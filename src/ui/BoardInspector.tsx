import { matchOrientationPreset, ORIENTATION_PRESETS, orientationPreset } from '../core/geometry';
import { findPreset, presetsFor } from '../core/lumber';
import { useStore } from '../state/store';
import { LengthInput } from './LengthInput';

export function BoardInspector(): JSX.Element {
  const boards = useStore((state) => state.boards);
  const selection = useStore((state) => state.selection);
  const units = useStore((state) => state.settings.units);
  const updateBoard = useStore((state) => state.updateBoard);
  const deleteBoards = useStore((state) => state.deleteBoards);
  const duplicateSelection = useStore((state) => state.duplicateSelection);

  const selected = boards.filter((board) => selection.includes(board.id));

  if (selected.length === 0) {
    return (
      <div className="panel-empty">
        Select a board to edit it. Shift-click to select more than one.
      </div>
    );
  }

  if (selected.length > 1) {
    return (
      <div className="panel-body">
        <p className="muted">{selected.length} boards selected.</p>
        <div className="button-row">
          <button type="button" onClick={duplicateSelection}>
            Duplicate
          </button>
          <button type="button" className="danger" onClick={() => deleteBoards(selection)}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  const board = selected[0];
  if (!board) return <div className="panel-empty">Select a board to edit it.</div>;

  const currentOrientation = matchOrientationPreset(board.orientation);

  return (
    <div className="panel-body">
      <label className="field">
        <span className="field-label">Label</span>
        <input
          className="input"
          value={board.label}
          onChange={(event) => updateBoard(board.id, { label: event.target.value })}
        />
      </label>

      <label className="field">
        <span className="field-label">Section</span>
        <select
          className="input"
          value={board.nominal ?? ''}
          onChange={(event) => {
            const preset = findPreset(event.target.value);
            if (!preset) return;
            updateBoard(board.id, { section: preset.section, nominal: preset.id });
          }}
        >
          {board.nominal ? null : <option value="">Custom</option>}
          {presetsFor(units).map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>

      <div className="field-pair">
        <LengthInput
          label="Thickness"
          value={board.section.thickness}
          units={units}
          // Editing a dimension by hand means it is no longer a stock size, so
          // the nominal name is cleared rather than left to lie about it.
          onCommit={(mm) =>
            updateBoard(board.id, {
              section: { ...board.section, thickness: mm },
              nominal: undefined,
            })
          }
        />
        <LengthInput
          label="Width"
          value={board.section.width}
          units={units}
          onCommit={(mm) =>
            updateBoard(board.id, {
              section: { ...board.section, width: mm },
              nominal: undefined,
            })
          }
        />
      </div>

      <LengthInput
        label="Length"
        value={board.length}
        units={units}
        onCommit={(mm) => updateBoard(board.id, { length: mm })}
      />

      <label className="field">
        <span className="field-label">Orientation</span>
        <select
          className="input"
          value={currentOrientation?.id ?? ''}
          onChange={(event) => {
            const preset = orientationPreset(event.target.value);
            if (preset) updateBoard(board.id, { orientation: preset.basis });
          }}
        >
          {currentOrientation ? null : <option value="">Custom</option>}
          {ORIENTATION_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      {currentOrientation ? <p className="hint">{currentOrientation.hint}</p> : null}

      <label className="checkbox">
        <input
          type="checkbox"
          checked={board.pinned}
          onChange={(event) => updateBoard(board.id, { pinned: event.target.checked })}
        />
        <span>
          Pin in place
          <em>Anchors the board so constraints move other parts instead of this one.</em>
        </span>
      </label>

      <div className="button-row">
        <button type="button" onClick={duplicateSelection}>
          Duplicate
        </button>
        <button type="button" className="danger" onClick={() => deleteBoards([board.id])}>
          Delete
        </button>
      </div>
    </div>
  );
}
