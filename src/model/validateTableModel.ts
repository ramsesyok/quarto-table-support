import type { TableModel } from './TableModel';
import { isValidLabel } from '../formats/tbl/parseTblAttributes';

export type Validation = {
  errors: string[];
  warnings: string[];
};

/**
 * Apply の直前に走らせる検査。
 *
 * errors があるときは書き戻さない。warnings は表示したうえで続行を選べる。
 */
export function validateTableModel(
  model: TableModel,
  options: { otherPartColumnCounts?: number[] } = {}
): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (model.rows.length === 0 || model.columns.length === 0) {
    errors.push('表が空です。');
  }

  const label = model.attributes.label?.trim();
  if (label) {
    if (!isValidLabel(label)) {
      errors.push(`label="${label}" は tbl- で始まる必要があります（本文で @${label} と参照するため）。`);
    }
    if (model.attributes.unnumbered) {
      warnings.push('.unnumbered が付いているため、label は無効になり相互参照はできません。');
    }
  }

  const widths = model.columns.map(c => c.width);
  const specified = widths.filter(
    (w): w is number => typeof w === 'number' && Number.isFinite(w)
  );
  if (specified.length > 0 && specified.length !== widths.length) {
    errors.push(
      `列幅は全列に指定するか、全列とも空にしてください（${specified.length}／${widths.length} 列のみ指定されています）。`
    );
  }
  if (specified.length === widths.length && specified.reduce((a, b) => a + b, 0) <= 0) {
    errors.push('列幅の合計が 0 以下です。');
  }

  // 分割表では全パートの列数が一致していないと、テンプレート側で列幅の統一がスキップされる
  for (const count of options.otherPartColumnCounts ?? []) {
    if (count > 0 && count !== model.columns.length) {
      warnings.push(
        `分割表の他のパートは ${count} 列ですが、このパートは ${model.columns.length} 列です。` +
          '列数が一致しないと列幅の統一がスキップされます。'
      );
      break;
    }
  }

  if (model.headerRows > model.rows.length) {
    errors.push('ヘッダ行数が行数を超えています。');
  }

  return { errors, warnings };
}
