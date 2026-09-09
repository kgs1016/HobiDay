const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function eventTarget() {
  const events = new Map();
  return {
    addEventListener(name, callback) {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name).add(callback);
    },
    removeEventListener(name, callback) { events.get(name)?.delete(callback); },
    dispatch(name) { events.get(name)?.forEach(callback => callback()); },
    count() { return [...events.values()].reduce((sum, group) => sum + group.size, 0); },
  };
}

function environment() {
  let now = 100_000;
  let id = 0;
  const timers = new Map();
  const document = { ...eventTarget(), visibilityState: 'visible' };
  const window = eventTarget();
  const add = (callback, delay, interval = 0) => {
    timers.set(++id, { callback, at: now + delay, interval });
    return id;
  };
  return {
    document, window, timers,
    globals: {
      document, window, AbortController,
      Date: { now: () => now },
      setTimeout: (callback, delay) => add(callback, delay),
      clearTimeout: timer => timers.delete(timer),
      setInterval: (callback, delay) => add(callback, delay, delay),
      clearInterval: timer => timers.delete(timer),
    },
    async advance(ms) {
      const target = now + ms;
      while (true) {
        const entry = [...timers].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry) break;
        const [key, timer] = entry;
        now = timer.at;
        if (timer.interval) timer.at += timer.interval;
        else timers.delete(key);
        timer.callback();
        await flush();
      }
      now = target;
      await flush();
    },
    visibility(value) { document.visibilityState = value; document.dispatch('visibilitychange'); },
  };
}

async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }

function load(file, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, ...globals });
  return exports;
}

async function checkPolling() {
  const env = environment();
  const { startPolling, sameRows } = load('polling.ts', env.globals);
  const requests = [];
  const poller = startPolling(signal => new Promise(resolve => requests.push({ signal, resolve })), 5000);
  await env.advance(0);
  assert.equal(requests.length, 1);
  await env.advance(20_000);
  assert.equal(requests.length, 1, 'a slow request must not overlap periodic requests');
  poller.refresh();
  poller.refresh();
  requests[0].resolve();
  await flush();
  await env.advance(0);
  assert.equal(requests.length, 2, 'refresh during a request is coalesced and runs after it');
  requests[1].resolve();
  await flush();
  await env.advance(4999);
  assert.equal(requests.length, 2);
  await env.advance(1);
  assert.equal(requests.length, 3, 'interval starts after the response finishes');
  env.visibility('hidden');
  assert.equal(requests[2].signal.aborted, true, 'backgrounding cancels the active request');
  requests[2].resolve();
  await flush();
  await env.advance(30_000);
  assert.equal(requests.length, 3, 'hidden screens do not poll');
  env.visibility('visible');
  assert.equal(requests.length, 4, 'returning to the screen refreshes immediately');
  poller.stop();
  assert.equal(requests[3].signal.aborted, true);
  requests[3].resolve();
  await flush();
  await env.advance(30_000);
  poller.refresh();
  assert.equal(requests.length, 4, 'an unmounted poller cannot start another request');
  assert.equal(env.document.count(), 0);
  assert.equal(env.timers.size, 0);

  const row = { id: 1, body: 'hello', sender_photo: 'old.webp' };
  assert.equal(sameRows([row], [{ ...row }]), true);
  assert.equal(sameRows([row], [{ ...row, body: 'edited' }]), false);
  assert.equal(sameRows([row], [{ ...row, sender_photo: 'new.webp' }]), false);
  assert.equal(sameRows([row], []), false);
  assert.equal(sameRows(null, []), false);

  const failures = [];
  const retryEnv = environment();
  const retryModule = load('polling.ts', { ...retryEnv.globals, console: { error: (...args) => failures.push(args) } });
  let attempts = 0;
  const retry = retryModule.startPolling(async () => { if (++attempts === 1) throw new Error('offline'); }, 5000);
  await retryEnv.advance(5000);
  assert.equal(attempts, 2, 'a failed request does not stop future polling');
  assert.equal(failures.length, 1);
  retry.stop();
}

async function checkClock() {
  const env = environment();
  let store;
  const { useNow } = load('browserState.ts', {
    ...env.globals,
    require: () => ({ useSyncExternalStore: (subscribe, snapshot, serverSnapshot) => { store = { subscribe, snapshot, serverSnapshot }; } }),
  });
  useNow();
  assert.equal(store.serverSnapshot(), 0, 'static export has no build-time date');
  let updates = 0;
  const stopA = store.subscribe(() => updates++);
  const initial = store.snapshot();
  const stopB = store.subscribe(() => updates++);
  assert.equal(env.timers.size, 1, 'all consumers share one clock');
  await env.advance(30_000);
  assert.equal(store.snapshot(), initial + 30_000);
  const beforeHide = store.snapshot();
  env.visibility('hidden');
  await env.advance(90_000);
  assert.equal(store.snapshot(), beforeHide);
  assert.equal(env.timers.size, 0);
  env.visibility('visible');
  assert.equal(store.snapshot(), initial + 120_000, 'resuming updates expired-session status immediately');
  assert.ok(updates >= 5);
  stopA();
  stopB();
  assert.equal(env.timers.size, 0);
  assert.equal(env.document.count() + env.window.count(), 0);
  assert.equal(store.snapshot(), 0, 'new forms cannot initialize from a stale timestamp');
}

async function checkNewsReader() {
  const id = '08746754-0cf8-4020-9cdc-10fe7cbeb9f0';
  const article = { id, kind: 'news', title: 'News', summary: 'Summary' };
  let result = { data: article, error: null };
  const requests = [];
  const { fetchNewsArticle } = load('supabase.ts', {
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://local.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } },
    require: name => name === '@supabase/supabase-js' ? { createClient: () => ({
      rpc: async (name, args) => { requests.push({ name, args }); return result; },
    }) } : {},
  });
  for (const invalid of ['', 'not-a-news-id', '../post']) {
    assert.equal((await fetchNewsArticle(invalid)).article, null);
  }
  assert.equal(requests.length, 0, 'malformed links must not send invalid UUIDs to the server');
  assert.equal((await fetchNewsArticle(id)).article, article);
  assert.equal(requests[0].args.p_article, id, 'a detail link reads its exact article, independent of list pagination');
  result = { data: null, error: null };
  assert.equal((await fetchNewsArticle(id)).error, null, 'a hidden or deleted article is unavailable without a transport error');
  result = { data: article, error: { message: 'connection failed' } };
  const failed = await fetchNewsArticle(id);
  assert.equal(failed.article, null, 'an errored response must not expose stale content');
  assert.equal(failed.error, 'connection failed', 'network failures must offer retry instead of showing a removed-article message');
}

(async () => {
  const { findGym, matchesSearch } = load('homeSearch.ts');
  const gyms = [{ name: '더클라임 연남점', aliases: ['The Climb Yeonnam'] }];
  assert.equal(findGym(gyms, 'theclimb yeonnam'), gyms[0], 'gym aliases ignore case and spacing');
  for (const missingGym of [null, undefined, '', '   ']) {
    assert.equal(findGym(gyms, missingGym), undefined, 'an optional home gym must not crash the home page');
    const person = { nickname: '홈짐 없는 회원', homeGym: missingGym, area: null };
    const gym = findGym(gyms, person.homeGym);
    const fields = [person.nickname, person.homeGym, person.area, ...(gym?.aliases ?? [])];
    assert.equal(matchesSearch('', fields), true, 'a missing home gym must not hide a person from the default list');
    assert.equal(matchesSearch('홈짐 없는', fields), true, 'a person without a home gym remains searchable by nickname');
  }
  assert.equal(matchesSearch('연남 서연', ['더클라임 연남점', '서연']), true, 'all search words may match different visible fields');
  assert.equal(matchesSearch('연남 지훈', ['더클라임 연남점', '서연']), false, 'unmatched search words filter out the row');
  assert.equal(matchesSearch('  ', [undefined, null]), true, 'clearing search restores every row');
  await checkPolling();
  await checkClock();
  await checkNewsReader();
  console.log('PASS: gym alias search, combined search terms, serialized polling, queued refresh, cancellation, background/resume, failure recovery, unchanged rows, shared clock and cleanup');
  console.log('PASS: news detail links, unavailable articles and retryable failures');
})().catch(error => { console.error(error); process.exitCode = 1; });
