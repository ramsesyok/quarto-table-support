import { useState } from 'react';
import type { TableModel, CellAlign } from '../model/TableModel';
import { normalizeRange, type CellRange } from '../model/mergeCells';

type Props = {
  model: TableModel;
  selection: CellRange | undefined;
  onSelect: (range: CellRange | undefined) => void;
  onChangeCell: (row: number, col: number, text: string) => void;
  onChangeAlign: (col: number, align: CellAlign | undefined) => void;
  onChangeWidth: (col: number, width: number | undefined) => void;
};

export function GridView({
  model,
  selection,
  onSelect,
  onChangeCell,
  onChangeAlign,
  onChangeWidth
}: Props) {
  const [editing, setEditing] = useState<{ row: number; col: number } | undefined>();
  const range = selection ? normalizeRange(selection) : undefined;

  const inSelection = (row: number, col: number) =>
    !!range &&
    range.startRow <= row &&
    row <= range.endRow &&
    range.startCol <= col &&
    col <= range.endCol;

  const handleClick = (row: number, col: number, shift: boolean) => {
    if (shift && selection) {
      onSelect({ ...selection, endRow: row, endCol: col });
    } else {
      onSelect({ startRow: row, startCol: col, endRow: row, endCol: col });
    }
  };

  return (
    <div className="grid-wrap">
      <table className="grid">
        <thead>
          <tr className="col-controls">
            {model.columns.map((col, c) => (
              <th key={`w${c}`}>
                <input
                  className="width-input"
                  type="number"
                  min={0}
                  step="any"
                  value={col.width ?? ''}
                  placeholder="自動"
                  title="列幅（widths）。空欄なら自動幅"
                  onChange={e =>
                    onChangeWidth(c, e.target.value === '' ? undefined : Number(e.target.value))
                  }
                />
                <select
                  className="align-select"
                  value={col.align ?? ''}
                  title="列の揃え"
                  onChange={e =>
                    onChangeAlign(c, (e.target.value || undefined) as CellAlign | undefined)
                  }
                >
                  <option value="">既定</option>
                  <option value="left">左</option>
                  <option value="center">中央</option>
                  <option value="right">右</option>
                </select>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, r) => (
            <tr key={r} className={r < model.headerRows ? 'header-row' : undefined}>
              {row.map((cell, c) => {
                if (cell.hidden) return null;
                const isEditing = editing?.row === r && editing?.col === c;
                return (
                  <td
                    key={cell.id}
                    rowSpan={cell.rowspan}
                    colSpan={cell.colspan}
                    className={[
                      inSelection(r, c) ? 'selected' : '',
                      r < model.headerRows ? 'is-header' : '',
                      cell.rowspan > 1 || cell.colspan > 1 ? 'is-merged' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ textAlign: model.columns[c]?.align ?? undefined }}
                    onClick={e => handleClick(r, c, e.shiftKey)}
                    onDoubleClick={() => setEditing({ row: r, col: c })}
                  >
                    {isEditing ? (
                      <textarea
                        autoFocus
                        value={cell.text}
                        onChange={e => onChangeCell(r, c, e.target.value)}
                        onBlur={() => setEditing(undefined)}
                        onKeyDown={e => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditing(undefined);
                          }
                          // Alt+Enter で改行、Enter だけなら確定
                          if (e.key === 'Enter' && !e.altKey) {
                            e.preventDefault();
                            setEditing(undefined);
                          }
                        }}
                      />
                    ) : (
                      <span className="cell-text">
                        {cell.text.split('\n').map((line, i) => (
                          <span key={i} className="cell-line">
                            {line}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        クリックで選択・Shift+クリックで範囲選択・ダブルクリックで編集（Alt+Enter で改行）。
        Excel からは Ctrl+V で貼り付けられます。
      </p>
    </div>
  );
}
