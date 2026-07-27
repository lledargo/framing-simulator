import { useEffect, useState } from 'react';
import { formatLength, parseLength } from '../core/units';
import type { DisplayUnit } from '../core/types';

interface Props {
  value: number;
  units: DisplayUnit;
  onCommit: (mm: number) => void;
  label?: string;
  disabled?: boolean;
}

/**
 * A length field that speaks the way people write lengths.
 *
 * Text is kept as typed while the field has focus, so a half-finished `8' 6`
 * isn't reformatted mid-keystroke, and is only parsed and normalised on blur or
 * Enter. Unparseable input is marked and left alone rather than being replaced
 * with a guess.
 */
export function LengthInput({ value, units, onCommit, label, disabled }: Props): JSX.Element {
  const [text, setText] = useState(() => formatLength(value, units));
  const [editing, setEditing] = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!editing) setText(formatLength(value, units));
  }, [value, units, editing]);

  const commit = (): void => {
    const parsed = parseLength(text, units);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setEditing(false);
    setText(formatLength(parsed, units));
    onCommit(parsed);
  };

  return (
    <label className="field">
      {label ? <span className="field-label">{label}</span> : null}
      <input
        type="text"
        inputMode="text"
        className={invalid ? 'input invalid' : 'input'}
        value={text}
        disabled={disabled ?? false}
        onFocus={() => setEditing(true)}
        onChange={(event) => {
          setText(event.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setEditing(false);
            setInvalid(false);
            setText(formatLength(value, units));
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
