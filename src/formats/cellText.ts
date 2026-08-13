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

/** 箇条書き（`- ` / `* ` / `+ `）・番号付きリスト（`1. ` / `1) `）の項目行か。 */
export function isListItemLine(line: string): boolean {
  return /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
}

/**
 * 各行が「本当にリストとして解釈される項目行か」を返す。
 *
 * pandoc の markdown はリストで段落を中断できない（`lists_without_preceding_blankline`
 * は既定で無効）。`前置き` の直後に `- 項目` と書いても段落の続きになるだけなので、
 * **セルの先頭か空行の後から始まる並び**だけをリストとみなす。
 */
function listBlockFlags(lines: string[]): boolean[] {
  const flags: boolean[] = [];
  for (let i = 0; i < lines.length; i++) {
    const startsBlock = i === 0 || lines[i - 1].trim() === '' || flags[i - 1];
    flags.push(startsBlock && isListItemLine(lines[i]));
  }
  return flags;
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
 *
 * ただし次の行送りには付けない。付けなくても別ブロックになり、付けると余分な改行が
 * 入るため（pandoc で確認済み）:
 *
 * - リスト項目どうしの間（各項目の末尾に `<br>` が入ってしまう）
 * - 空行の前後（段落の区切り。`\` だけの行になってしまう）
 */
export function gridCellLines(text: string): string[] {
  const lines = text.split('\n').map(l => escapeGridCellLine(l.trim()));
  if (lines.length === 0) return [''];
  const inList = listBlockFlags(lines);
  return lines.map((line, i) => {
    if (i === lines.length - 1) return line;
    if (line === '' || lines[i + 1] === '') return line;
    if (inList[i] && inList[i + 1]) return line;
    return `${line}\\`;
  });
}

/**
 * グリッド表のセルから読み取った物理行を 1 つのテキストへ戻す。
 *
 * pandoc の解釈に合わせる:
 * - `<br>` / 行末バックスラッシュ `\` … ハード改行 → '\n'
 * - 単なる行の続き … ソフト改行 → 空白
 */
export function gridCellTextFromLines(lines: string[]): string {
  const raw = lines.map(l => unescapeGridCell(l).trim());
  const inList = listBlockFlags(raw);

  // 空行の前後とリスト項目どうしの間は `\` が無くても別ブロック＝改行。
  // gridCellLines がそこに `\` を書かないので、読み取りも対称にしておく。
  let joined = '';
  raw.forEach((line, i) => {
    if (i > 0) {
      const prev = raw[i - 1];
      const hard =
        !prev.endsWith('\\') &&
        (prev === '' || line === '' || (inList[i - 1] && inList[i]));
      joined += hard ? HARD_BREAK : '\n';
    }
    joined += line;
  });

  return joined
    .replace(/<br\s*\/?>[ \t]*\n?/gi, HARD_BREAK)
    .replace(/\\\n/g, HARD_BREAK)
    .replace(/\n/g, ' ')
    .split(HARD_BREAK)
    .map(part => part.trim())
    .join('\n')
    .trim();
}
