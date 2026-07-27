import { useMemo } from 'react';
import { describeFeature } from '../core/geometry';
import { describeInvalid } from '../core/solver';
import type { Board, Constraint, FeatureRef } from '../core/types';
import { formatLength } from '../core/units';
import { useStore } from '../state/store';
import { LengthInput } from './LengthInput';

function refLabel(ref: FeatureRef, boards: ReadonlyMap<string, Board>): string {
  if (ref.kind === 'ground') return 'Ground grid';
  const board = boards.get(ref.boardId);
  if (!board) return 'Deleted board';
  return `${board.label} · ${describeFeature(board, ref.feature)}`;
}

export function ConstraintPanel(): JSX.Element {
  const boards = useStore((state) => state.boards);
  const constraints = useStore((state) => state.constraints);
  const conflicts = useStore((state) => state.solve.conflicts);
  const invalid = useStore((state) => state.solve.invalid);
  const units = useStore((state) => state.settings.units);
  const updateConstraint = useStore((state) => state.updateConstraint);
  const deleteConstraint = useStore((state) => state.deleteConstraint);
  const setSelection = useStore((state) => state.setSelection);

  const byId = useMemo(() => new Map(boards.map((board) => [board.id, board] as const)), [boards]);

  if (constraints.length === 0) {
    return (
      <div className="panel-empty">
        No constraints yet. Pick the Constrain tool, then click one surface and the surface it
        should meet.
      </div>
    );
  }

  const select = (constraint: Constraint): void => {
    const ids = [constraint.a, constraint.b]
      .filter((ref) => ref.kind === 'board')
      .map((ref) => (ref as { boardId: string }).boardId);
    setSelection(ids);
  };

  return (
    <div className="panel-body">
      <ul className="constraint-list">
        {constraints.map((constraint) => {
          const conflict = conflicts.get(constraint.id);
          const problem = invalid.get(constraint.id);
          const status = problem ? 'invalid' : conflict ? 'conflict' : 'ok';

          return (
            <li key={constraint.id} className={`constraint ${status}`}>
              <div className="constraint-head">
                <button type="button" className="link" onClick={() => select(constraint)}>
                  <span className={`kind kind-${constraint.kind}`}>{constraint.kind}</span>
                  {refLabel(constraint.a, byId)}
                  <span className="arrow"> → </span>
                  {refLabel(constraint.b, byId)}
                </button>
                <button
                  type="button"
                  className="icon danger"
                  aria-label="Delete constraint"
                  onClick={() => deleteConstraint(constraint.id)}
                >
                  ×
                </button>
              </div>

              <div className="constraint-controls">
                <LengthInput
                  label="Offset"
                  value={constraint.offset}
                  units={units}
                  onCommit={(mm) => updateConstraint(constraint.id, { offset: mm })}
                />
                <label className="checkbox compact">
                  <input
                    type="checkbox"
                    checked={constraint.enabled}
                    onChange={(event) =>
                      updateConstraint(constraint.id, { enabled: event.target.checked })
                    }
                  />
                  <span>Active</span>
                </label>
              </div>

              {problem ? <p className="problem">{describeInvalid(problem)}</p> : null}
              {conflict ? (
                <p className="problem">
                  Cannot be satisfied along with the others — off by{' '}
                  {formatLength(conflict.residual, units)}.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
