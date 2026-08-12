import type { TableModel } from '../../model/TableModel';
import { hasMerges } from '../../model/TableModel';
import { serializePipeTable } from '../pipeTable/serializePipeTable';
import { serializeGridTable } from '../gridTable/serializeGridTable';
import { canUseMergeCols } from '../mergeCols/canUseMergeCols';
import { serializeMergeCols } from '../mergeCols/simulateMergeCols';

export type SerializeOptions = {
  /** fence のコロン数。既存ブロックを書き戻すときは元の数を渡す。 */
  colons?: number;
  /** 分割表のパート数。1 なら通常表。 */
  partCount?: number;
};

/** 表本体（div の中身）だけを出力する。パート単位の置換で使う。 */
export function serializeTableBody(model: TableModel, partCount = 1): string {
  const merged = hasMerges(model);

  if (!merged && model.headerRows === 1) {
    return serializePipeTable(model);
  }
  if (model.outputFormat === 'mergeCols' && canUseMergeCols(model, partCount).ok) {
    // merge-cols は「同じ値が縦に並んだ素のパイプ表」に戻して出力する
    return serializePipeTable(flattenMerges(model));
  }
  if (!merged && model.headerRows !== 1) {
    return serializeGridTable(model);
  }
  return serializeGridTable(model);
}

/** `::: {.tbl …}` ブロック全体を出力する（新規作成・M=1 の書き戻しで使う）。 */
export function serializeTblBlock(
  model: TableModel,
  options: SerializeOptions = {}
): string {
  const colons = ':'.repeat(Math.max(3, options.colons ?? 3));
  const partCount = options.partCount ?? 1;
  const body = serializeTableBody(model, partCount);
  return `${colons} ${buildFenceHeader(model, partCount)}\n${body}\n${colons}`;
}

export function buildFenceHeader(model: TableModel, partCount = 1): string {
  const parts: string[] = ['.tbl'];
  if (model.attributes.unnumbered) parts.push('.unnumbered');
  for (const cls of model.attributes.extraClasses) parts.push(`.${cls}`);

  if (model.attributes.caption) parts.push(`caption="${escapeAttr(model.attributes.caption)}"`);
  if (model.attributes.label && !model.attributes.unnumbered) {
    parts.push(`label="${escapeAttr(model.attributes.label)}"`);
  }

  const widths = model.columns.map(c => c.width);
  if (widths.every(w => typeof w === 'number' && Number.isFinite(w))) {
    parts.push(`widths="${widths.join(',')}"`);
  }

  if (model.outputFormat === 'mergeCols') {
    const check = canUseMergeCols(model, partCount);
    if (check.ok) parts.push(`merge-cols="${serializeMergeCols(check.cols)}"`);
  }

  for (const [key, value] of model.attributes.extraAttributes) {
    parts.push(`${key}="${escapeAttr(value)}"`);
  }

  return `{${parts.join(' ')}}`;
}

/** 結合を解いて「同じ値が縦に並んだ」素の表へ戻す（merge-cols 出力用）。 */
function flattenMerges(model: TableModel): TableModel {
  const rows = model.rows.map(row => row.map(cell => ({ ...cell })));
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const cell = rows[r][c];
      if (cell.hidden || cell.rowspan <= 1) continue;
      for (let rr = r + 1; rr < r + cell.rowspan; rr++) {
        rows[rr][c].text = cell.text;
        rows[rr][c].hidden = false;
        rows[rr][c].rowspan = 1;
        rows[rr][c].colspan = 1;
      }
      cell.rowspan = 1;
    }
  }
  return { ...model, rows };
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '\\"');
}
