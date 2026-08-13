import { useEffect, useMemo, useState } from 'react';
import type { TableModel, CellAlign } from '../model/TableModel';
import type { EditorContext, ToWebviewMessage } from '../model/WebviewMessages';
import { hasMerges } from '../model/TableModel';
import { normalizeTableModel } from '../model/normalizeTableModel';
import { completeColumnWidths } from '../model/columnWidths';
import { mergeCells, normalizeRange, type CellRange } from '../model/mergeCells';
import { unmergeCell } from '../model/unmergeCell';
import { insertRow, deleteRow, insertColumn, deleteColumn } from '../model/rowColOps';
import { parseTsv } from '../model/parseTsv';
import { canUseMergeCols } from '../formats/mergeCols/canUseMergeCols';
import { serializeTableBody, serializeTblBlock } from '../formats/tbl/serializeTblBlock';
import { vscode } from './vscodeApi';
import { Toolbar } from './Toolbar';
import { AttributesPanel } from './AttributesPanel';
import { GridView } from './GridView';

export function TableEditor() {
  const [model, setModel] = useState<TableModel | undefined>();
  const [context, setContext] = useState<EditorContext | undefined>();
  const [selection, setSelection] = useState<CellRange | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent<ToWebviewMessage>) => {
      const data = event.data;
      if (data.type === 'init') {
        setModel(normalizeTableModel(data.model));
        setContext(data.context);
        setMessage(data.context.warnings.join('\n') || undefined);
      } else if (data.type === 'applied') {
        setMessage('ドキュメントへ反映しました。');
      } else if (data.type === 'error') {
        setMessage(data.message);
      }
    };
    window.addEventListener('message', onMessage);
    vscode().postMessage({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const text = event.clipboardData?.getData('text/plain');
      if (!text || !text.includes('\t')) return;
      event.preventDefault();
      setModel(current => {
        const pasted = parseTsv(text, current?.id ?? '');
        return current
          ? normalizeTableModel({ ...pasted, attributes: current.attributes })
          : pasted;
      });
      setSelection(undefined);
      setMessage('Excel から貼り付けました（結合は取り込まれません）。');
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const mergeColsCheck = useMemo(
    () => (model ? canUseMergeCols(model, context?.partCount ?? 1) : undefined),
    [model, context]
  );

  const preview = useMemo(() => {
    if (!model || !context) return '';
    // 空欄 1 列の列幅は、書き戻しと同じく残り幅で埋めた姿を見せる
    const shown = completeColumnWidths(model);
    const wholeBlock = context.kind !== 'tblPart' || context.partCount === 1;
    return wholeBlock
      ? serializeTblBlock(shown, { partCount: context.partCount })
      : serializeTableBody(shown, context.partCount);
  }, [model, context]);

  if (!model || !context) {
    return <div className="loading">読み込み中…</div>;
  }

  const update = (next: TableModel) => {
    setModel(normalizeTableModel(next));
  };

  const runMerge = () => {
    if (!selection) return setMessage('結合する範囲を選択してください。');
    const result = mergeCells(model, selection);
    if (!result.ok) return setMessage(result.message);
    setModel(result.value);
    setMessage(undefined);
  };

  const runUnmerge = () => {
    if (!selection) return setMessage('解除するセルを選択してください。');
    const { startRow, startCol } = normalizeRange(selection);
    const result = unmergeCell(model, startRow, startCol);
    if (!result.ok) return setMessage(result.message);
    setModel(result.value);
    setMessage(undefined);
  };

  const anchor = selection ? normalizeRange(selection) : undefined;

  return (
    <div className="editor">
      <Toolbar
        model={model}
        context={context}
        mergeColsCheck={mergeColsCheck}
        onInsertRow={() => update(insertRow(model, anchor ? anchor.endRow + 1 : model.rows.length))}
        onDeleteRow={() => update(deleteRow(model, anchor ? anchor.startRow : model.rows.length - 1))}
        onInsertColumn={() =>
          update(insertColumn(model, anchor ? anchor.endCol + 1 : model.columns.length))
        }
        onDeleteColumn={() =>
          update(deleteColumn(model, anchor ? anchor.startCol : model.columns.length - 1))
        }
        onMerge={runMerge}
        onUnmerge={runUnmerge}
        onChangeOutputFormat={format => update({ ...model, outputFormat: format })}
        onChangeHeaderRows={n => update({ ...model, headerRows: n })}
        onTogglePreview={() => setShowPreview(v => !v)}
        showPreview={showPreview}
        onApply={() => vscode().postMessage({ type: 'apply', model })}
      />

      <AttributesPanel
        model={model}
        editable={context.attributesEditable}
        enclosingClasses={context.enclosingClasses}
        onChange={update}
      />

      {message && <div className="message">{message}</div>}

      <GridView
        model={model}
        selection={selection}
        onSelect={setSelection}
        onChangeCell={(row, col, text) => {
          const rows = model.rows.map(r => r.map(c => ({ ...c })));
          rows[row][col].text = text;
          update({ ...model, rows });
        }}
        onChangeAlign={(col, align) => {
          const columns = model.columns.map((c, i) =>
            i === col ? { ...c, align } : c
          );
          update({ ...model, columns });
        }}
        onChangeWidth={(col, width) => {
          const columns = model.columns.map((c, i) => (i === col ? { ...c, width } : c));
          update({ ...model, columns });
        }}
      />

      {showPreview && (
        <div className="preview">
          <div className="preview-title">
            生成される Markdown
            {context.partCount > 1 && `（分割表の ${context.partIndex + 1} 番目のパートのみ）`}
          </div>
          <pre>{preview}</pre>
        </div>
      )}

      <div className="status">
        {model.rows.length} 行 × {model.columns.length} 列 ／ ヘッダ {model.headerRows} 行
        {hasMerges(model) ? ' ／ 結合あり' : ' ／ 結合なし'}
      </div>
    </div>
  );
}

export type { CellAlign };
