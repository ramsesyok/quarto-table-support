/**
 * セル本文と Markdown の相互変換。
 *
 * モデル内では改行を '\n' で持ち、出力時に `<br>` へ変換する（AUTHORING.md §6
 * 「セル内で改行する（`<br>`）」）。グリッド表では行末のバックスラッシュ `\` でも
 * 改行できるため、読み込み時はどちらも '\n' に戻す。
 */

/** ソフト改行（空白）と区別するための一時マーカー。本文には現れない制御文字を使う。 */
const HARD_BREAK = '\u0001';

/** Markdown のセル文字列 → モデルのテキスト（`<br>` / 行末 `\` を改行へ）。 */
export function cellTextFromMarkdown(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim();
}

/** モデルのテキスト → Markdown のセル文字列（改行を `<br>` へ）。 */
export function cellTextToMarkdown(text: string): string {
  return text.split('\n').map(l => l.trim()).join('<br>');
}

/** パイプ表のセルに入れるため `|` をエスケープする。 */
export function escapePipeCell(text: string): string {
  return cellTextToMarkdown(text).replace(/\|/g, '\\|');
}

export function unescapePipeCell(text: string): string {
  return text.replace(/\\\|/g, '|');
}

/**
 * グリッド表のセル 1 行ぶんをエスケープする。
 *
 * グリッド表は罫線 `|` で列を区切るため、本文中の `|` はエスケープしないと
 * 列の区切りと区別できない。Pandoc は grid table 内の `\|` を `|` と解釈する。
 */
export function escapeGridCellLine(line: string): string {
  return line.replace(/\|/g, '\\|');
}

export function unescapeGridCell(text: string): string {
  return text.replace(/\\\|/g, '|');
}

/**
 * グリッド表のセル本文を物理行に分ける。
 *
 * グリッド表のセルは複数行で書けるが、単に行を分けただけだと pandoc はソフト改行
 * （＝空白）として扱う。実際に改行させるには行末に `<br>` かバックスラッシュ `\` が要る
 * （AUTHORING.md §6）。
 *
 * ここでは**バックスラッシュ**を使う。pandoc 上で raw HTML ではなく native な LineBreak
 * になるため PDF（typst）側でもそのまま改行になり、`<br>` のように後続行の先頭へ
 * 余分な空白が入らない（Quarto 同梱 pandoc で確認済み）。
 */
export function gridCellLines(text: string): string[] {
  const lines = text.split('\n').map(l => escapeGridCellLine(l.trim()));
  if (lines.length === 0) return [''];
  return lines.map((l, i) => (i < lines.length - 1 ? `${l}\\` : l));
}

/**
 * グリッド表のセルから読み取った物理行を 1 つのテキストへ戻す。
 *
 * pandoc の解釈に合わせる:
 * - `<br>` / 行末バックスラッシュ `\` … ハード改行 → '\n'
 * - 単なる行の続き … ソフト改行 → 空白
 */
export function gridCellTextFromLines(lines: string[]): string {
  return lines
    .map(l => unescapeGridCell(l).trim())
    .join('\n')
    .replace(/<br\s*\/?>[ \t]*\n?/gi, HARD_BREAK)
    .replace(/\\\n/g, HARD_BREAK)
    .replace(/\n/g, ' ')
    .split(HARD_BREAK)
    .map(part => part.trim())
    .join('\n')
    .trim();
}
