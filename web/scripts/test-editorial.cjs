const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const editorial = require('../src/content/editorial-2026-09-09.json');

const source = fs.readFileSync(path.join(__dirname, '../src/components/PostBody.tsx'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText;
const output = { exports: {} };
vm.runInNewContext(code, { exports: output.exports, module: output, require, URL });
const render = body => renderToStaticMarkup(React.createElement(output.exports.default, { body }));

for (const article of editorial.news) {
  assert.ok(article.summary.split('\n\n').length >= 3, 'news includes context across multiple paragraphs');
  assert.ok([...article.summary].length <= 2000, 'operator RPC must not truncate the briefing');
  assert.equal(new URL(article.url).protocol, 'https:');
}
for (const post of editorial.gear) {
  assert.ok([...post.title].length <= 80);
  assert.ok([...post.body].length <= 3000);
  const html = render(post.body);
  assert.equal((html.match(/<h2 /g) ?? []).length, 4, 'gear sections render as headings');
  assert.equal((html.match(/<a /g) ?? []).length, 1, 'each product has a clickable official source');
  assert.ok(!html.includes('## '), 'markdown syntax is not exposed in the reader');
}
const unsafe = render('<img src=x onerror=alert(1)>\n\n[위험](javascript:alert(1))\n\nhttps://trusted.example@evil.example/test');
assert.ok(unsafe.includes('&lt;img'));
assert.ok(!unsafe.includes('<img'));
assert.ok(!unsafe.includes('<a '), 'HTML, script URLs, and misleading credential URLs stay plain text');
const links = render('원문 https://example.com/article.\n두 번째 줄\n\n[제품 정보](https://example.com/product?a=1&b=2)');
assert.ok(links.includes('href="https://example.com/article"'), 'sentence punctuation is excluded');
assert.ok(links.includes('href="https://example.com/product?a=1&amp;b=2"'));
assert.ok(links.includes('rel="noopener noreferrer ugc"'));
assert.ok(links.includes('두 번째 줄'));
console.log('PASS: expanded news, gear content, and safe post link rendering');
