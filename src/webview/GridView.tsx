import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TableModel, CellAlign } from '../model/TableModel';
import { normalizeRange, type CellRange } from '../model/mergeCells';
import { inspectColumnWidths, WIDTH_TOTAL } from '../model/columnWidths';
import { insertLineBreak } from '../model/cellTextEditing';

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
  const widths = inspectColumnWidths(model);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** 次の描画でキャレットを置く位置。textarea は再描画で末尾へ飛ぶので自分で戻す。 */
  const caretRef = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const at = caretRef.current;
    const el = textareaRef.current;
    if (at === undefined || !el) return;
    caretRef.current = undefined;
    el.setSelectionRange(at, at);
  });

  const startEditing = (row: number, col: number, caret?: number) => {
    caretRef.current = caret;
    setEditing({ row, col });
  };

  // F2 で選択中のセルを編集モードにする（Excel と同じくキャレットは末尾）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'F2' || editing) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!range) return;
      const cell = model.rows[range.startRow]?.[range.startCol];
      if (!cell || cell.hidden) return;
      event.preventDefault();
      startEditing(range.startRow, range.startCol, cell.text.length);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [model, range, editing]);

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
            {model.columns.map((col, c) => {
              const filled = widths.autoFill?.col === c ? widths.autoFill.width : undefined;
              // 超過はどの列が悪いか決められないので、幅の入った欄をまとめて赤くする
              const invalid =
                (widths.overflow && col.width !== undefined) ||
                (col.width !== undefined && col.width < 0);
              return (
                <th key={`w${c}`}>
                  <input
                    className={invalid ? 'width-input invalid' : 'width-input'}
                    type="number"
                    min={0}
                    step="any"
                    value={col.width ?? ''}
                    placeholder={filled !== undefined ? `${filled}` : '自動'}
                    title={
                      filled !== undefined
                        ? `列幅（widths）。空欄のまま適用すると残りの ${filled} が入ります`
                        : '列幅（widths）。空欄なら自動幅'
                    }
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
              );
            })}
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
                    onDoubleClick={() => startEditing(r, c, cell.text.length)}
                  >
                    {isEditing ? (
                      <textarea
                        autoFocus
                        ref={textareaRef}
                        value={cell.text}
                        onChange={e => onChangeCell(r, c, e.target.value)}
                        onBlur={() => setEditing(undefined)}
                        onKeyDown={e => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditing(undefined);
                            return;
                          }
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          if (!e.altKey) {
                            setEditing(undefined);
                            return;
                          }
                          // Alt+Enter で改行。textarea は Alt 付きの Enter では
                          // 改行しないので、自分で入れてキャレットも戻す
                          const el = e.currentTarget;
                          const edit = insertLineBreak(
                            el.value,
                            el.selectionStart,
                            el.selectionEnd
                          );
                          caretRef.current = edit.caret;
                          onChangeCell(r, c, edit.text);
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
      {widths.hasNegative && <p className="hint error">列幅に負の値があります。</p>}
      {widths.overflow && (
        <p className="hint error">
          列幅の合計が {widths.total} です。{WIDTH_TOTAL} 以内に収めてください
          （このままでは適用できません）。
        </p>
      )}
      {!widths.overflow && widths.autoFill && (
        <p className="hint">
          空欄の {widths.autoFill.col + 1} 列目には、適用・プレビュー時に残りの{' '}
          {widths.autoFill.width} が入ります。
        </p>
      )}

      <p className="hint">
        クリックで選択・Shift+クリックで範囲選択・ダブルクリックまたは F2 で編集
        （Alt+Enter で改行・Enter か Escape で編集終了）。
        Excel からは Ctrl+V で貼り付けられます。
      </p>
    </div>
  );
}
