const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, imports) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => Object.hasOwn(imports, name) ? imports[name] : require(name) });
  return exports;
}

const Link = { default: props => React.createElement('a', props) };
const Notice = load('components/LoadErrorNotice.tsx', {});
const List = load('components/HomeSessionList.tsx', {
  'next/link': Link,
  '@/components/LoadErrorNotice': Notice,
  '@/components/SessionCard': { default: ({ session }) => React.createElement('a', { href: `/session?id=${session.id}` }, session.gym) },
  '@/components/illustrations': { HoldIllust: () => null },
});
const fixture = { id: 'existing', gym: '기존 모임 장소' };
const render = props => renderToStaticMarkup(React.createElement(List.default, {
  sessions: [], shown: [], error: false, loading: false, photoUrls: {}, onRetry() {}, onReset() {}, ...props,
}));

(async () => {
  let sessions = [];
  let people = [];
  let sessionThrows = false;
  let peopleThrows = false;
  const { fetchHomeLists } = load('lib/homeLists.ts', { './supabase': {
    fetchSessions: async () => { if (sessionThrows) throw new Error('network failure'); return sessions; },
    fetchPeople: async me => { assert.equal(me.id, 'member'); if (peopleThrows) throw new Error('network failure'); return people; },
  } });

  let data = await fetchHomeLists('member');
  assert.equal(data.sessions, sessions, 'a successful empty response stays distinguishable from an error');
  let html = render({ sessions: data.sessions, shown: data.sessions });
  assert.ok(html.includes('아직 열린 모임이 없어요') && html.includes('모임 만들기'));
  assert.ok(!html.includes('불러오지 못했어요'));

  // 느린 사람 조회가 먼저 끝난 모임 목록 표시를 막으면 안 된다.
  let finishPeople;
  const seen = [];
  const staggered = load('lib/homeLists.ts', { './supabase': {
    fetchSessions: async () => [fixture],
    fetchPeople: () => new Promise(resolve => { finishPeople = resolve; }),
  } });
  let settled = false;
  const pending = staggered.fetchHomeLists('member', {
    sessions: rows => seen.push(['sessions', rows]),
    people: rows => seen.push(['people', rows]),
  }).then(() => { settled = true; });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0], 'sessions');
  assert.equal(seen[0][1][0], fixture, 'sessions are delivered while the other request is still pending');
  finishPeople(null);
  await pending;
  assert.equal(seen[1][0], 'people');
  assert.equal(seen[1][1], null, 'late failure stays an error rather than an empty success');

  people = [{ id: 'person' }];
  for (const response of [null, undefined, { error: 'denied' }]) {
    sessions = response;
    data = await fetchHomeLists('member');
    assert.equal(data.sessions, null, 'null and invalid responses are errors, never empty successes');
    assert.equal(data.people, people, 'a session failure does not discard a successful people response');
    html = render({ error: data.sessions === null });
    assert.ok(html.includes('모임을 불러오지 못했어요') && html.includes('다시 시도'));
    assert.ok(!html.includes('아직 열린 모임이 없어요') && !html.includes('조건에 맞는 모임이 없어요'));
  }

  sessionThrows = true;
  data = await fetchHomeLists('member');
  assert.equal(data.sessions, null, 'thrown network errors are also recoverable');
  assert.equal(data.people, people);

  sessionThrows = false;
  peopleThrows = true;
  sessions = [fixture];
  data = await fetchHomeLists('member');
  assert.equal(data.sessions, sessions, 'a people failure does not discard successful sessions');
  assert.equal(data.people, null);

  html = render({ sessions, shown: sessions, error: true });
  assert.ok(html.includes('기존 모임 장소') && html.includes('이전에 불러온 목록'));
  assert.ok(!html.includes('아직 열린 모임이 없어요'));
  html = render({ sessions, shown: sessions, error: true, loading: true });
  assert.ok(html.includes('disabled=""') && html.includes('다시 불러오는 중') && html.includes('기존 모임 장소'));

  html = render({ loading: true });
  assert.ok(html.includes('모임 불러오는 중') && !html.includes('없어요'));
  html = render({ sessions, shown: [] });
  assert.ok(html.includes('조건에 맞는 모임이 없어요') && html.includes('전체 모임 보기'));
  assert.ok(!html.includes('아직 열린 모임이 없어요'));

  peopleThrows = false;
  data = await fetchHomeLists('member');
  html = render({ sessions: data.sessions, shown: data.sessions, error: data.sessions === null });
  assert.ok(html.includes('기존 모임 장소') && !html.includes('다시 시도'), 'a successful retry replaces the error with the list');
  console.log('PASS: empty vs failed fetches, independent lists, loading/filter states, retained rows and successful retry rendering');
})().catch(error => { console.error(error); process.exitCode = 1; });
