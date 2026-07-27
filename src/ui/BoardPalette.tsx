import { presetsFor } from '../core/lumber';
import { formatLengthShort } from '../core/units';
import { useStore } from '../state/store';

export function BoardPalette(): JSX.Element {
  const units = useStore((state) => state.settings.units);
  const addBoardFromPreset = useStore((state) => state.addBoardFromPreset);

  return (
    <div className="panel-body">
      <p className="hint">
        Adds a board at the default length — click as many as you need. Set the exact length and
        orientation on the <strong>Board</strong> tab.
      </p>
      <div className="palette">
        {presetsFor(units).map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="palette-item"
            onClick={() => addBoardFromPreset(preset.id)}
            title={`${formatLengthShort(preset.section.thickness, units)} x ${formatLengthShort(
              preset.section.width,
              units,
            )} actual`}
          >
            <strong>{preset.label}</strong>
            <span>
              {formatLengthShort(preset.section.thickness, units)} ×{' '}
              {formatLengthShort(preset.section.width, units)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
