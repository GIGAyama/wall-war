/**
 * =================================================================
 * GIGA Game Architect - Server Side Script
 * アプリ名: カベ合戦！〜道を切り拓け〜
 * =================================================================
 */

/**
 * ウェブアプリへのアクセス時に実行される関数
 * ここでHTMLテンプレートを読み込んでブラウザに返します。
 */
function doGet(e) {
  // index.html ファイルを元にテンプレートを作成
  return HtmlService.createTemplateFromFile('index')
    .evaluate() // テンプレート内のスクリプトを実行（include関数など）
    .setTitle('カベ合戦！') // ブラウザのタブに表示されるタイトル
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0') // スマホ・タブレット対応
    .setFaviconUrl('https://drive.google.com/uc?id=1OIhQ91S_uELPAlgnwJvQiqMlQYUrWSRT&.png')
}

/**
 * HTMLファイル内に別のファイルを読み込むための関数
 * index.html の中で <?!= include('css'); ?> のように使います。
 * これにより、CSSやJavaScriptを別ファイルに分けて管理できます。
 * * @param {string} filename - 読み込むファイルの名前（拡張子.htmlは不要）
 * @return {string} - ファイルの中身のテキスト
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
