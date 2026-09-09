const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, URLSearchParams, console, require: name => require(path.join(__dirname, '../src', name.replace('@/', ''))), ...globals });
  return exports;
}

(async () => {
  const { freeBoardHref, mockBoardFeed, isBoardTopic } = load('community.ts');
  assert.equal(isBoardTopic('all'), false);
  assert.equal(isBoardTopic('question'), true);
  const href = freeBoardHref('question', '암장 & 테이프');
  const params = new URL(href, 'http://localhost').searchParams;
  assert.equal(params.get('topic'), 'question');
  assert.equal(params.get('q'), '암장 & 테이프', 'search survives round-trip navigation');
  const all = mockBoardFeed(null, '');
  const questions = mockBoardFeed('question', '');
  assert.equal(all.pinned.length, 2);
  assert.equal(all.pinned[0].id, 'be301249-1702-4ff8-8956-998078cb443c');
  assert.ok(all.items.every(p => !all.pinned.some(pin => pin.id === p.id)));
  assert.ok(questions.items.length > 0 && questions.items.every(p => p.topic === 'question'));
  assert.equal(mockBoardFeed('lost', 'unmatched').pinned.length, 2);
  assert.equal(mockBoardFeed('lost', 'unmatched').items.length, 0);

  const calls = [];
  let result = { data: { items: [], pinned: [] }, error: null };
  const api = load('supabase.ts', {
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.local', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } },
    require: name => name === '@supabase/supabase-js' ? { createClient: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return result; } }) } : {},
    console: { error() {} },
  });
  await api.fetchBoardFeed('gym', '  암장  ', { id: 'cursor', created_at: '2026-09-01' });
  assert.equal(calls[0].args.p_topic, 'gym');
  assert.equal(calls[0].args.p_query, '암장');
  assert.equal(calls[0].args.p_before_id, 'cursor');
  result = { data: null, error: { message: 'offline' } };
  assert.equal(await api.fetchBoardFeed(null, ''), null, 'errors are not an empty feed');
  result = { data: { ok: true, id: 'new' }, error: null };
  await api.createPost('제목', '내용', 'board', 'question');
  assert.equal(calls.at(-1).name, 'post_create_with_topic');
  assert.equal(calls.at(-1).args.p_topic, 'question');
  assert.ok(!('pinned_rank' in calls.at(-1).args));
  await api.updatePost('new', '수정', '내용', 'gym');
  assert.equal(calls.at(-1).name, 'post_update_with_topic');
  assert.equal(calls.at(-1).args.p_topic, 'gym');
  console.log('PASS: board filters, pins, navigation queries, RPC cursor and topic persistence');
})().catch(error => { console.error(error); process.exitCode = 1; });
