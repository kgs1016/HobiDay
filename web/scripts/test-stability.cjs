const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../src');
function load(file, imports = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const api = {};
  vm.runInNewContext(code, { exports: api, console, AbortController, DOMException, setTimeout, clearTimeout, URL, ...globals, require: name => imports[name] ?? {} });
  return api;
}
const network = load('lib/network.ts');
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
async function deadlines() {
  let signal;
  await assert.rejects(network.withDeadline(s => { signal = s; return new Promise(() => {}); }, 10), /지연/);
  assert.equal(signal.aborted, true);
  const parent = new AbortController(); let started = false;
  parent.abort();
  await assert.rejects(network.withDeadline(() => { started = true; return Promise.resolve(); }, 100, parent.signal), e => e.name === 'AbortError');
  assert.equal(started, false);
  let finish;
  const waiting = network.withDeadline(() => new Promise(r => finish = r), 100, (signal = new AbortController()).signal);
  await flush(); signal.abort(); await assert.rejects(waiting, e => e.name === 'AbortError'); finish('late');
}
async function lists() {
  let group, direct = [{ match_id: 'one' }], seen = [];
  const api = load('lib/chatLists.ts', { './supabase': { fetchChats: async () => direct, fetchSessionChats: () => new Promise(r => group = r) } });
  const parent = new AbortController();
  const waiting = api.fetchChatLists(parent.signal, x => seen.push(['direct', x]), x => seen.push(['group', x]));
  await flush(); assert.equal(seen.length, 1); assert.equal(seen[0][1], direct);
  group(null); await waiting; assert.equal(seen[1][1], null);
  seen = []; direct = [];
  const second = api.fetchChatLists(parent.signal, x => seen.push(x), x => seen.push(x));
  await flush(); parent.abort(); group([]); await second; assert.equal(seen.length, 1, 'late result is ignored after leaving');
}
function expression(component, variable, context) {
  const text = fs.readFileSync(path.join(root, 'app/chat/page.tsx'), 'utf8');
  const source = ts.createSourceFile('chat.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fn = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === component);
  let found;
  function scan(n) { if (ts.isVariableDeclaration(n) && n.name.getText(source) === variable) found = n.initializer; else ts.forEachChild(n, scan); }
  scan(fn.body); assert.ok(found);
  const code = ts.transpileModule('globalThis.run = (' + found.getText(source) + ');', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, context); return context.run;
}
async function messages() {
  for (const kind of ['Thread', 'SessionThread']) {
    let input = '지워지면 안 되는 메시지', busy = false, error = '';
    const ctx = { text: input, sending: { current: false }, setText: x => input = x, setBusy: x => busy = x, setSendError: x => error = x,
      chat: { match_id: 'one' }, room: { session_id: 'one' }, sendChat: async () => ({ error: 'network' }), sendSessionChat: async () => ({ error: 'network' }) };
    ctx.onSend = expression(kind, 'send', ctx);
    const submit = expression('ChatFrame', 'submit', ctx);
    await submit({ preventDefault() {} });
    assert.equal(input, ctx.text); assert.equal(busy, false); assert.ok(error);
    let complete, count = 0; ctx.onSend = () => { count++; return new Promise(r => complete = r); };
    const successful = submit({ preventDefault() {} }); await flush();
    await submit({ preventDefault() {} }); assert.equal(count, 1, 'double submit is blocked synchronously');
    complete(); await successful; assert.equal(input, ''); assert.equal(busy, false); assert.equal(error, '');
  }
}
async function uploads() {
  let instance, stopped = 0, calls = 0;
  class Upload {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- captures the constructed fake transport for assertions
    constructor(file, options) { this.options = options; instance = this; }
    async findPreviousUploads() { return [{ uploadUrl: 'previous' }]; }
    resumeFromPreviousUpload(p) { this.previous = p; }
    start() { calls++; }
    async abort() { stopped++; }
  }
  const sb = { auth: { getSession: async () => ({ data: { session: { access_token: 'not-a-secret', user: { id: 'owner' } } } }) },
    storage: { from: () => ({ info: async () => ({ data: null }) }) } };
  const api = load('lib/resumableUpload.ts', { 'tus-js-client': { Upload }, './supabase': { getSupabase: () => sb }, './network': network },
    { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' } } });
  let progress = [];
  const parent = new AbortController();
  const pending = api.resumableUpload('owner/draft/video.mp4', { size: 10, type: 'video/mp4' }, { signal: parent.signal, onProgress: n => progress.push(n) });
  await flush(); assert.equal(calls, 1); assert.equal(instance.previous.uploadUrl, 'previous');
  assert.equal(instance.options.endpoint, 'https://project.storage.supabase.co/storage/v1/upload/resumable');
  let headers = {}, xhr = {};
  await instance.options.onBeforeRequest({ setHeader: (k, v) => headers[k] = v, getUnderlyingObject: () => xhr });
  assert.equal(headers.authorization, 'Bearer not-a-secret'); assert.equal(xhr.timeout, 90000);
  instance.options.onProgress(5, 10); assert.equal(progress.at(-1), 50);
  parent.abort(); await assert.rejects(pending, e => e.name === 'AbortError'); assert.equal(stopped, 1);
  instance.options.onProgress(10, 10); assert.equal(progress.at(-1), 50, 'late progress cannot revive cancelled upload');
  const success = api.resumableUpload('owner/draft/video.mp4', { size: 10, type: 'video/mp4' });
  await flush(); instance.options.onSuccess(); await success;
}
async function badgeDeduplication() {
  let owner = 'alice', calls = 0, resolves = [];
  const sb = { auth: { getSession: async () => ({ data: { session: owner ? { user: { id: owner } } : null } }) },
    rpc: () => { calls++; const promise = new Promise(resolve => resolves.push(resolve)); promise.abortSignal = () => promise; return promise; } };
  const api = load('lib/supabase.ts', { './network': network, '@supabase/supabase-js': { createClient: () => sb } },
    { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'http://test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } } });
  const first = api.fetchInboxCounts(), second = api.fetchInboxCounts();
  await flush(); assert.equal(calls, 1, 'home and menu share an in-flight badge read');
  resolves.shift()({ data: { requests: 1, unread_messages: 2 }, error: null });
  assert.equal((await first).requests, 1); assert.equal((await second).unread_messages, 2);
  await api.fetchInboxCounts(); assert.equal(calls, 1, 'brief cache avoids immediate duplicate reads');
  owner = 'bob'; const third = api.fetchInboxCounts(); await flush(); assert.equal(calls, 2, 'account switch never reuses the old badge result');
  resolves.shift()({ data: { requests: 0, unread_messages: 0 }, error: null }); assert.equal((await third).requests, 0);
  owner = null; assert.equal(await api.fetchInboxCounts(), null);
}

async function authRecovery() {
  let response = { data: { session: null }, error: { name: 'AuthRetryableFetchError', code: 'network' } };
  const api = load('lib/supabase.ts', { './network': network, '@supabase/supabase-js': { createClient: () => ({auth: { getSession: async () => response }}) } },
    { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'http://test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } } });
  assert.equal(await api.currentUser(), null, 'existing nullable callers do not gain unhandled rejections');
  await assert.rejects(api.currentUser({throwOnError:true}));
  response = { data: { session: null }, error: { name:'AuthApiError', code:'refresh_token_not_found' } };
  assert.equal(await api.currentUser({throwOnError:true}), null, 'invalid sessions request login instead of endless retries');
  response = { data: { session: { user: { id:'recovered' } } }, error:null };
  assert.equal((await api.currentUser({throwOnError:true})).id,'recovered');
}

(async () => { await deadlines(); await lists(); await messages(); await uploads(); await badgeDeduplication(); await authRecovery(); console.log('PASS stability: deadlines, abort, independent lists, send recovery, duplicate submit, resumable URL, progress and pause'); })().catch(e => { console.error(e); process.exitCode = 1; });
