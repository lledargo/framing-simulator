import { CONTROL_PRESET_LIST } from '../scene/controls/inputMap';
import type { ControlPresetId } from '../scene/controls/inputMap';
import { useStore } from '../state/store';

export function SettingsPanel(): JSX.Element {
  const settings = useStore((state) => state.settings);
  const updateSettings = useStore((state) => state.updateSettings);

  return (
    <div className="panel-body">
      <label className="field">
        <span className="field-label">Units</span>
        <select
          className="input"
          value={settings.units}
          onChange={(event) =>
            updateSettings({ units: event.target.value === 'metric' ? 'metric' : 'imperial' })
          }
        >
          <option value="imperial">Imperial (feet &amp; inches)</option>
          <option value="metric">Metric (millimetres)</option>
        </select>
      </label>

      <fieldset className="field">
        <legend className="field-label">Navigation</legend>
        {CONTROL_PRESET_LIST.map((preset) => (
          <label key={preset.id} className="radio">
            <input
              type="radio"
              name="control-preset"
              checked={settings.controlPreset === preset.id}
              onChange={() => updateSettings({ controlPreset: preset.id as ControlPresetId })}
            />
            <span>
              {preset.label}
              <em>{preset.description}</em>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.showGrid}
          onChange={(event) => updateSettings({ showGrid: event.target.checked })}
        />
        <span>Show ground grid</span>
      </label>

      <div className="shortcuts">
        <h4>Trackpad</h4>
        <dl>
          <dt>Two-finger scroll</dt>
          <dd>{settings.controlPreset === 'fusion' ? 'Pan' : 'Orbit'}</dd>
          <dt>Shift + two-finger</dt>
          <dd>{settings.controlPreset === 'fusion' ? 'Orbit' : 'Pan'}</dd>
          <dt>Pinch</dt>
          <dd>Zoom to pointer</dd>
        </dl>
        <h4>Keyboard</h4>
        <dl>
          <dt>1 – 6</dt>
          <dd>Front, back, left, right, top, bottom</dd>
          <dt>0</dt>
          <dd>Isometric</dd>
          <dt>F</dt>
          <dd>Frame everything</dd>
          <dt>C</dt>
          <dd>Constrain tool</dd>
          <dt>V</dt>
          <dd>Select tool</dd>
          <dt>Esc</dt>
          <dd>Cancel current pick</dd>
          <dt>Delete</dt>
          <dd>Delete selection</dd>
        </dl>
      </div>
    </div>
  );
}
