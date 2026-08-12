# AGENTS.md

## プロジェクト概要

`design-doc-quarto-template` の統一テーブル記法 `::: {.tbl …}` を編集する VSCode 拡張。
`mkdocs-table-editor` をベースにしているが、**出力ルールは全面的に異なる**。

**仕様の正は [requirements.md](requirements.md)。実装前に必ず読むこと。**

参照すべき外部ドキュメント:

- `../design-doc-quarto-template/AUTHORING.md` §6「表」… 執筆者から見た `.tbl` の記法
- `../design-doc-quarto-template/template/design-doc.lua` … 実際の変換処理。
  `merge_body`（L193-259）と `Div`ハンドラ（L309-）が本拡張の挙動の根拠

## 動作環境

完全オフライン・エアギャップ環境で動くこと。

- 実行時にインターネット接続を要求しない
- CDN の JS / CSS / フォント / 画像を使わない
- フロントエンド資産はすべて拡張パッケージに同梱する
- npm パッケージはビルド時にバンドルされるものだけ使う

## 技術スタック

VSCode Extension API / TypeScript / React / Vite / Webview。
サーバコンポーネント・データベースは持たない。

## 設計原則

エディタ UI と記法変換ロジックを分離する。React エディタは `.tbl` / パイプ表 /
グリッド表 / `merge-cols` を一切知らない。

```text
React Table Editor
        ↓
TableModel（src/model/）
        ↓
Format Parser / Serializer（src/formats/）
  ├─ pipeTable
  ├─ gridTable
  ├─ mergeCols（判定・展開）
  └─ tbl（div 属性）
```

## 落とし穴（検証済み・変更しないこと）

- **グリッド表の桁は表示幅（東アジア全角=2）で数える。** pandoc は文字数ではなく
  表示幅で列位置を決める。文字数で揃えた表は 1 セルに潰れる。
  シリアライザ・パーサとも `src/formats/displayWidth.ts` を通すこと。
- **グリッド表のセル内改行は行末バックスラッシュ `\`。** 単に行を分けるだけでは
  pandoc はソフト改行（空白）にする。`<br>` でも改行できるが、バックスラッシュなら
  native な LineBreak になり PDF（typst）でもそのまま効き、後続行に余分な空白が入らない。
  パイプ表は 1 行しか書けないので `<br>` を使う。
- **`merge-cols` の連鎖は列を左から 1 パスで評価する。** `design-doc.lua` L235-242 が
  `for c = 1, ncol` で回すため、`prevcol[c]` が c より右だとその時点では未評価
  （＝結合していない扱い）になる。並び順を逆にしても階層は作れない。
- **`merge-cols` は div 全体＝すべてのパートに適用される。** ただし `is_plain_grid`
  ガード（L197）があるため、既に結合を持つグリッド表パートは影響を受けない。

## ブロック検出

`.tbl` div 自体がマーカー。旧版の `<!-- table-editor:start -->` コメントは使わない。

置換範囲は最小にすること。分割表ではカーソルのあるパートの行だけを差し替え、
div の fence 行・他パート・外側の `.landscape` には触れない。

開始 fence に対応する終了 fence が無い場合は、ドキュメントを一切変更せずエラーにする。

## Webview セキュリティ

- 制限的な CSP を使う
- リモートのスクリプト・スタイルを許可しない
- nonce ベースでスクリプトを読み込む
- ローカル資産は `webview.asWebviewUri` 経由

## テスト

UI 以外のロジックにユニットテストを書く。純粋な TypeScript 関数を Webview の外で
テストすることを優先し、手動 UI テストだけに頼らない。

記法まわりを変更したときは、**実際の pandoc で検証**すること:

```bash
"/c/Program Files/Quarto/bin/tools/pandoc.exe" -f markdown -t native sample.md
```

テンプレート込みの確認:

```bash
"/c/Program Files/Quarto/bin/tools/pandoc.exe" -f markdown -t html --lua-filter=../design-doc-quarto-template/template/design-doc.lua sample.qmd
```

## 品質方針

- 単純で保守しやすいコードを優先する
- テストしにくい凝ったパースロジックを避ける
- VSCode のドキュメント操作と Webview の UI ロジックを混ぜない
- 無関係なファイルを変更しない
- 大きな依存関係を理由なく導入しない
- 新しいフォーマットを足すときは `src/formats/<name>/` に閉じ、React 側のモデルを変えない
