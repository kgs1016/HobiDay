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
  assert.ok(!/(해요|돼요|이에요|예요|있어요|했어요|주세요)[.!?]/.test(article.summary), 'news uses formal article prose');
  assert.ok(article.summary.split('\n\n').every(p => p.endsWith('니다.')), 'paragraphs end in formal prose');
  assert.ok(article.image_alt && fs.existsSync(path.join(__dirname, '../public', article.image_url)), 'each news article includes a bundled illustration');
}
assert.equal(new Set(editorial.news.map(a => a.image_url)).size, editorial.news.length, 'article illustrations are distinct');
const photographs = require('../src/content/news-artwork.json');
const artworkSource = fs.readFileSync(path.join(__dirname, '../src/components/NewsArtwork.tsx'), 'utf8');
const artworkCode = ts.transpileModule(artworkSource, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;
const artworkOutput = { exports: {} };
vm.runInNewContext(artworkCode, {
  exports: artworkOutput.exports, module: artworkOutput,
  require: id => id === '@/content/editorial-2026-09-09.json' ? editorial
    : id === '@/content/news-artwork.json' ? photographs : require(id),
});
const renderArtwork = (article, thumbnail = false) => renderToStaticMarkup(React.createElement(artworkOutput.exports.default, {article, thumbnail}));
assert.equal(new Set(photographs.map(a => a.article_id)).size, editorial.news.length);
for (const art of photographs) {
  const article = editorial.news.find(a => a.id === art.article_id);
  assert.ok(article && art.image_alt && fs.existsSync(path.join(__dirname, '../public', art.image_url)));
  const html = renderArtwork({...article, image_url: 'https://hobiday-eight.vercel.app' + article.image_url});
  assert.ok(html.includes(`src="${art.image_url}"`), 'existing production image URLs resolve to the new bundled image');
  assert.ok(renderArtwork({...article, image_url: art.image_url}).includes(`src="${art.image_url}"`));
  const thumbnail = renderArtwork(article, true);
  assert.ok(!thumbnail.includes('<figcaption'), 'photo notes appear in article details only');
  assert.ok(!thumbnail.includes('<a '), 'thumbnails inside news links never nest credit links');
  if (art.kind === 'photo') {
    assert.ok(art.credit && art.caption && art.width && art.height);
    assert.equal(new URL(art.source_url).protocol, 'https:');
    assert.equal(new URL(art.license_url).protocol, 'https:');
    assert.ok(html.includes(art.credit) && !thumbnail.includes(art.credit), 'photo credits remain visible in article details');
    assert.ok(html.includes(`href="${art.source_url}"`));
    assert.ok(!html.includes('AI로 생성') && !thumbnail.includes('AI 생성'), 'actual photos are never labelled as generated');
    assert.ok(html.includes('h-auto') && !html.includes('object-cover'), 'photos retain the entire frame and original watermark');
  } else {
    assert.equal(art.kind, 'ai');
    assert.ok(html.includes('[이해를 돕기 위해 AI로 생성한 사진입니다]'));
    assert.ok(!thumbnail.includes('AI 생성') && !thumbnail.includes('AI로 생성'), 'AI disclosure appears below the detail photo only');
  }
  const custom = renderArtwork({...article, image_url:'https://example.com/operator-photo.jpg'});
  assert.ok(custom.includes('src="https://example.com/operator-photo.jpg"'), 'later operator images are preserved');
  assert.ok(!custom.includes('AI로 생성') && !custom.includes('World Climbing'), 'unrecognized images do not inherit unrelated credits');
}
assert.equal(renderArtwork({...editorial.news[0],image_url:'javascript:alert(1)'}), '');
console.log('PASS: news photo credits, AI labels, original framing, native asset resolution and later image overrides');
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
