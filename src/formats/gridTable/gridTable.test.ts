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
});
