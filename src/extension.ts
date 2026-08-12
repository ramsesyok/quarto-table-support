import * as vscode from 'vscode';
import type { TableModel } from './model/TableModel';
import type { EditorContext, FromWebviewMessage, ToWebviewMessage } from './model/WebviewMessages';
import { validateTableModel } from './model/validateTableModel';
import { normalizeTableModel } from './model/normalizeTableModel';
import { findEditTarget, type EditTarget } from './markdown-document/findEditTarget';
import { replaceLines, withSurroundingBlankLines } from './markdown-document/replaceRange';
import { generateTableId } from './markdown-document/generateTableId';
import { serializeTableBody, serializeTblBlock } from './formats/tbl/serializeTblBlock';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('quartoTable.open', () => openTableEditor(context))
  );
}

export function deactivate() {
  // 何も保持しない
}

async function openTableEditor(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('テーブルを編集する .qmd / .md ファイルを開いてください。');
    return;
  }

  const document = editor.document;
  const lines = document.getText().split(/\r\n?|\n/);
  const cursorLine = editor.selection.active.line;

  const found = findEditTarget(lines, cursorLine, generateTableId());
  if (!found.ok) {
    vscode.window.showErrorMessage(found.message);
    return;
  }
  const target = found.value;

  const panel = vscode.window.createWebviewPanel(
    'quartoTableEditor',
    'Quarto Table Editor',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'out', 'webview')]
    }
  );

  panel.webview.html = buildHtml(panel.webview, context.extensionUri);

  const post = (message: ToWebviewMessage) => panel.webview.postMessage(message);

  panel.webview.onDidReceiveMessage(async (message: FromWebviewMessage) => {
    switch (message.type) {
      case 'ready':
        post({ type: 'init', model: target.model, context: toContext(target) });
        break;

      case 'apply': {
        const applied = await applyToDocument(document, target, message.model);
        if (applied.ok) {
          post({ type: 'applied' });
        } else {
          post({ type: 'error', message: applied.message });
        }
        break;
      }

      case 'close':
        panel.dispose();
        break;
    }
  });
}

function toContext(target: EditTarget): EditorContext {
  return {
    kind: target.kind,
    partCount: target.partCount,
    partIndex: target.partIndex,
    attributesEditable: target.attributesEditable,
    enclosingClasses: target.enclosingClasses,
    warnings: target.warnings
  };
}

type ApplyResult = { ok: true } | { ok: false; message: string };

async function applyToDocument(
  document: vscode.TextDocument,
  target: EditTarget,
  rawModel: TableModel
): Promise<ApplyResult> {
  const model = normalizeTableModel(rawModel);

  const validation = validateTableModel(model, {
    otherPartColumnCounts: target.otherPartColumnCounts
  });
  if (validation.errors.length > 0) {
    return { ok: false, message: validation.errors.join('\n') };
  }
  if (validation.warnings.length > 0) {
    const choice = await vscode.window.showWarningMessage(
      validation.warnings.join('\n'),
      { modal: true },
      '続行する'
    );
    if (choice !== '続行する') return { ok: false, message: '書き戻しを中止しました。' };
  }

  const lines = document.getText().split(/\r\n?|\n/);
  const eol = document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';

  let range = target.range;
  let text: string;

  if (target.kind === 'new') {
    const inserted = withSurroundingBlankLines(
      lines,
      target.range.start,
      serializeTblBlock(model, { colons: target.colons })
    );
    range = inserted.range;
    text = inserted.text;
  } else if (target.kind === 'plainTable') {
    text = serializeTblBlock(model, { colons: target.colons });
  } else if (target.partCount === 1 && target.divRange) {
    // 単一表の .tbl は属性も編集できるので div ごと置き換える
    range = target.divRange;
    text = serializeTblBlock(model, { colons: target.colons, partCount: 1 });
  } else {
    // 分割表はカーソルのあるパートの行だけを置き換える（div 行・他パートは触らない）
    text = serializeTableBody(model, target.partCount);
  }

  const updated = replaceLines(lines, range, text);

  const edit = new vscode.WorkspaceEdit();
  const whole = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length)
  );
  edit.replace(document.uri, whole, updated.join(eol));

  const applied = await vscode.workspace.applyEdit(edit);
  return applied ? { ok: true } : { ok: false, message: 'ドキュメントへの反映に失敗しました。' };
}

function buildHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = createNonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'assets', 'main.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'assets', 'main.css')
  );

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" nonce="${nonce}" href="${styleUri}">
  <title>Quarto Table Editor</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
