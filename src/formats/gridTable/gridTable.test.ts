import { describe, it, expect } from 'vitest';
import { parseGridTable } from './parseGridTable';
import { serializeGridTable } from './serializeGridTable';
import { displayWidth } from '../displayWidth';

/** AUTHORING.md §6「横結合・見出し結合・マルチヘッダ」の例。 */
const MULTI_HEADER = [
  '+----------+----------+----------+',
  '| 項目     | 実績                |',
  '+          +----------+----------+',
  '|          | 前期     | 当期     |',
  '+==========+==========+==========+',
  '| 売上     | 100      | 120      |',
  '+----------+----------+----------+'
].join('\n');

describe('parseGridTable', () => {
  it('マルチヘッダ・rowspan・colspan を読み取る', () => {
    const result = parseGridTable(MULTI_HEADER);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const m = result.value;

    expect(m.columns).toHaveLength(3);
    expect(m.rows).toHaveLength(3);
    expect(m.headerRows).toBe(2);

    // 「項目」が 2 行を縦結合
    expect(m.rows[0][0].text).toBe('項目');
    expect(m.rows[0][0].rowspan).toBe(2);
    expect(m.rows[1][0].hidden).toBe(true);

    // 「実績」が 2 列を横結合
    expect(m.rows[0][1].text).toBe('実績');
    expect(m.rows[0][1].colspan).toBe(2);
    expect(m.rows[0][2].hidden).toBe(true);

    expect(m.rows[1][1].text).toBe('前期');
    expect(m.rows[1][2].text).toBe('当期');
    expect(m.rows[2].map(c => c.text)).toEqual(['売上', '100', '120']);
  });

  it('列揃えをヘッダ終端行から読む', () => {
    const src = [
      '+------+------+------+',
      '| a    | b    | c    |',
      '+:=====+:====:+=====:+',
      '| 1    | 2    | 3    |',
      '+------+------+------+'
    ].join('\n');
    const result = parseGridTable(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.columns.map(c => c.align)).toEqual(['left', 'center', 'right']);
  });

  it('ヘッダが無い表は最上段の罫線から揃えを読む', () => {
    const src = [
      '+:-----+-----:+',
      '| a    | b    |',
      '+------+------+'
    ].join('\n');
    const result = parseGridTable(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.headerRows).toBe(0);
    expect(result.value.columns.map(c => c.align)).toEqual(['left', 'right']);
  });
});

describe('serializeGridTable', () => {
  it('罫線を表示幅（全角=2）で揃える', () => {
    const parsed = parseGridTable(MULTI_HEADER);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const out = serializeGridTable(parsed.value);
    const widths = out.split('\n').map(displayWidth);
    expect(new Set(widths).size).toBe(1);
  });

  it('マルチヘッダの例を往復しても構造が保たれる', () => {
    const first = parseGridTable(MULTI_HEADER);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const out = serializeGridTable(first.value);
    const second = parseGridTable(out);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.value.headerRows).toBe(first.value.headerRows);
    expect(second.value.rows.map(r => r.map(c => [c.text, c.rowspan, c.colspan, c.hidden]))).toEqual(
      first.value.rows.map(r => r.map(c => [c.text, c.rowspan, c.colspan, c.hidden]))
    );
  });

  it('rowspan は境界線をそのセルの部分だけ空白にする', () => {
    const parsed = parseGridTable(MULTI_HEADER);
    if (!parsed.ok) throw new Error('parse failed');
    const out = serializeGridTable(parsed.value).split('\n');
    // 1 行目と 2 行目の間の罫線。先頭列は空白、残りは罫線
    expect(out[2].startsWith('+     ')).toBe(true);
    expect(out[2]).toMatch(/-\+$/);
  });

  it('セル内改行を複数行として書き出す', () => {
    const parsed = parseGridTable(MULTI_HEADER);
    if (!parsed.ok) throw new Error('parse failed');
    const model = parsed.value;
    model.rows[2][0].text = '売上\n（税込）';

    const out = serializeGridTable(model);
    expect(out).toContain('（税込）');

    const again = parseGridTable(out);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.rows[2][0].text).toBe('売上\n（税込）');
  });

  it('リスト項目の行には `\\` を付けない（項目末尾に余計な改行が入るため）', () => {
    const parsed = parseGridTable(MULTI_HEADER);
    if (!parsed.ok) throw new Error('parse failed');
    const model = parsed.value;
    model.rows[2][0].text = '- 一つ目\n- 二つ目';
    model.rows[2][1].text = '1. 一つ目\n2. 二つ目';
    model.rows[2][2].text = '前置き\n- 一つ目';

    const out = serializeGridTable(model);
    expect(out).toMatch(/\|\s*- 一つ目\s*\|/); // `\` 無し
    expect(out).toMatch(/\|\s*1\. 一つ目\s*\|/);

    const again = parseGridTable(out);
    if (!again.ok) throw new Error('reparse failed');
    expect(again.value.rows[2][0].text).toBe('- 一つ目\n- 二つ目');
    expect(again.value.rows[2][1].text).toBe('1. 一つ目\n2. 二つ目');
    expect(again.value.rows[2][2].text).toBe('前置き\n- 一つ目');
  });

  it('文章行の直後のリストには空行を補う（無いとリストにならないため）', () => {
    const parsed = parseGridTable(MULTI_HEADER);
    if (!parsed.ok) throw new Error('parse failed');
    const model = parsed.value;
    model.rows[2][0].text = '受注入力画面\n1. 一つ目\n2. 二つ目';

    const out = serializeGridTable(model);
    // 文章行にもリスト項目にも `\` は付かない
    expect(out).not.toMatch(/受注入力画面\\/);
    expect(out).not.toMatch(/一つ目\\/);
    // 文章行とリストの間に空のセル行が入る
    const lines = out.split('\n');
    const textLine = lines.findIndex(l => l.includes('受注入力画面'));
    const firstItem = lines.findIndex(l => l.includes('1. 一つ目'));
    expect(firstItem).toBe(textLine + 2);
    expect(lines[textLine + 1]).toMatch(/^\|\s+\|/);

    // 補った空行は読み戻しで畳む（往復で空行が増えていかない）
    const again = parseGridTable(out);
    if (!again.ok) throw new Error('reparse failed');
    expect(again.value.rows[2][0].text).toBe('受注入力画面\n1. 一つ目\n2. 二つ目');
    expect(serializeGridTable(again.value)).toBe(out);
  });

  it('自分で空行を挟んでも結果は同じ（読み戻しでは畳む）', () => {
    const parsed = parseGridTable(MULTI_HEADER);
    if (!parsed.ok) throw new Error('parse failed');

    const withBlank = parsed.value;
    withBlank.rows[2][0].text = '前置き\n\n- 一つ目\n- 二つ目';
    const withoutBlank = parseGridTable(MULTI_HEADER);
    if (!withoutBlank.ok) throw new Error('parse failed');
    withoutBlank.value.rows[2][0].text = '前置き\n- 一つ目\n- 二つ目';

    const out = serializeGridTable(withBlank);
    expect(out).toBe(serializeGridTable(withoutBlank.value));
    expect(out).not.toMatch(/前置き\\/);
    expect(out).not.toMatch(/一つ目\\/);

    const again = parseGridTable(out);
    if (!again.ok) throw new Error('reparse failed');
    expect(again.value.rows[2][0].text).toBe('前置き\n- 一つ目\n- 二つ目');
  });

  it('リストが絡まない空行（段落の区切り）は往復で保たれる', () => {
    const parsed = parseGridTable(MULTI_HEADER);
    if (!parsed.ok) throw new Error('parse failed');
    const model = parsed.value;
    model.rows[2][0].text = '一段落目\n\n二段落目';

    const out = serializeGridTable(model);
    expect(out).not.toMatch(/一段落目\\/);

    const again = parseGridTable(out);
    if (!again.ok) throw new Error('reparse failed');
    expect(again.value.rows[2][0].text).toBe('一段落目\n\n二段落目');
  });
});
