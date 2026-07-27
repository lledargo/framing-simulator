import { useMemo } from 'react';
import { buildCutList, cutListToCsv, formatTotalRun } from '../core/cutlist';
import { formatLength, formatLengthShort } from '../core/units';
import { useStore } from '../state/store';

function downloadFile(name: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function CutListPanel(): JSX.Element {
  const boards = useStore((state) => state.boards);
  const units = useStore((state) => state.settings.units);
  const name = useStore((state) => state.name);
  const setSelection = useStore((state) => state.setSelection);

  const cutList = useMemo(() => buildCutList(boards, units), [boards, units]);

  if (cutList.rows.length === 0) {
    return <div className="panel-empty">Add some boards and the cut list fills in.</div>;
  }

  return (
    <div className="panel-body">
      <div className="table-scroll">
        <table className="cutlist">
          <thead>
            <tr>
              <th>Section</th>
              <th>Length</th>
              <th className="num">Qty</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {cutList.rows.map((row) => (
              <tr
                key={row.key}
                onClick={() => setSelection(row.boardIds)}
                title={row.labels.join(', ')}
              >
                <td>
                  <strong>{row.nominal}</strong>
                  <span className="sub">
                    {formatLengthShort(row.thickness, units)} ×{' '}
                    {formatLengthShort(row.width, units)}
                  </span>
                </td>
                <td>{formatLength(row.length, units)}</td>
                <td className="num">{row.quantity}</td>
                <td className="num">{formatTotalRun(row.totalLength, units)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td>
                {units === 'imperial' ? `${cutList.totals.totalBoardFeet.toFixed(1)} bf` : ''}
              </td>
              <td className="num">{cutList.totals.pieces}</td>
              <td className="num">{formatTotalRun(cutList.totals.totalLength, units)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="button-row">
        <button
          type="button"
          onClick={() =>
            downloadFile(
              `${name.replace(/[^\w-]+/g, '-').toLowerCase()}-cutlist.csv`,
              cutListToCsv(cutList, units),
              'text/csv',
            )
          }
        >
          Export CSV
        </button>
      </div>
    </div>
  );
}
