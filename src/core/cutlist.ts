import { boardFeet, formatLength, formatLengthShort, toInches } from './units';
import type { Board, UnitSystem } from './types';

/**
 * The cut list: what you take to the lumber yard and to the saw.
 *
 * Boards are grouped by cross-section and length, because two 2x4s cut to 92
 * 5/8" are one line item with quantity 2, not two line items. Lengths are
 * bucketed to a tenth of a millimetre first, so floating point noise from the
 * solver can't split a group in half.
 */

const LENGTH_BUCKET = 0.1;

export interface CutListRow {
  key: string;
  /** Nominal name where the board came from a preset, else the actual size. */
  nominal: string;
  thickness: number;
  width: number;
  length: number;
  quantity: number;
  /** All boards in the group, so the UI can highlight them in the viewport. */
  boardIds: string[];
  labels: string[];
  totalLength: number;
  totalBoardFeet: number;
}

export interface CutListTotals {
  pieces: number;
  totalLength: number;
  totalBoardFeet: number;
}

export interface CutList {
  rows: CutListRow[];
  totals: CutListTotals;
}

function bucket(value: number): number {
  return Math.round(value / LENGTH_BUCKET) * LENGTH_BUCKET;
}

export function sectionLabel(board: Board, system: UnitSystem): string {
  if (board.nominal) return board.nominal;
  const t = formatLengthShort(board.section.thickness, system);
  const w = formatLengthShort(board.section.width, system);
  return `${t} x ${w}`;
}

export function buildCutList(boards: readonly Board[], system: UnitSystem): CutList {
  const groups = new Map<string, CutListRow>();

  for (const board of boards) {
    const thickness = bucket(board.section.thickness);
    const width = bucket(board.section.width);
    const length = bucket(board.length);
    const nominal = sectionLabel(board, system);
    const key = `${nominal}|${thickness}|${width}|${length}`;

    const existing = groups.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.boardIds.push(board.id);
      existing.labels.push(board.label);
      existing.totalLength += length;
      existing.totalBoardFeet += boardFeet(width, thickness, length);
      continue;
    }

    groups.set(key, {
      key,
      nominal,
      thickness,
      width,
      length,
      quantity: 1,
      boardIds: [board.id],
      labels: [board.label],
      totalLength: length,
      totalBoardFeet: boardFeet(width, thickness, length),
    });
  }

  // Widest section first, then longest piece — the order you'd cut in.
  const rows = [...groups.values()].sort(
    (a, b) => b.width - a.width || b.thickness - a.thickness || b.length - a.length,
  );

  const totals = rows.reduce<CutListTotals>(
    (acc, row) => ({
      pieces: acc.pieces + row.quantity,
      totalLength: acc.totalLength + row.totalLength,
      totalBoardFeet: acc.totalBoardFeet + row.totalBoardFeet,
    }),
    { pieces: 0, totalLength: 0, totalBoardFeet: 0 },
  );

  return { rows, totals };
}

/** Total run of material, in the unit people buy it by. */
export function formatTotalRun(mm: number, system: UnitSystem): string {
  if (system === 'metric') return `${(mm / 1000).toFixed(2)} m`;
  return `${(toInches(mm) / 12).toFixed(2)} ft`;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function cutListToCsv(cutList: CutList, system: UnitSystem): string {
  const header = ['Section', 'Thickness', 'Width', 'Length', 'Qty', 'Total length', 'Board feet', 'Pieces'];

  const lines = [header.map(csvCell).join(',')];

  for (const row of cutList.rows) {
    lines.push(
      [
        row.nominal,
        formatLengthShort(row.thickness, system),
        formatLengthShort(row.width, system),
        formatLength(row.length, system),
        String(row.quantity),
        formatTotalRun(row.totalLength, system),
        row.totalBoardFeet.toFixed(2),
        row.labels.join('; '),
      ]
        .map(csvCell)
        .join(','),
    );
  }

  lines.push('');
  lines.push(
    [
      'TOTAL',
      '',
      '',
      '',
      String(cutList.totals.pieces),
      formatTotalRun(cutList.totals.totalLength, system),
      cutList.totals.totalBoardFeet.toFixed(2),
      '',
    ]
      .map(csvCell)
      .join(','),
  );

  return lines.join('\n');
}
