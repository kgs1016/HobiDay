const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/thumbnailRecovery.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const api = {};
vm.runInNewContext(code, { exports: api });

async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function setup(initialUrl, getUrl) {
  const changes = [];
  const recovery = api.createThumbnailRecovery(initialUrl, getUrl, state => changes.push(state));
  return { recovery, changes, latest: () => changes.at(-1) };
}

(async () => {
  // Lazy-loaded images may first request their original signed URL after it expires.
  let calls = 0;
  const expired = setup('expired.jpg', async () => { calls++; return 'fresh.jpg'; });
  expired.recovery.start();
  assert.equal(calls, 0, 'working initial URLs do not need another signing request');
  expired.recovery.imageFailed(0);
  expired.recovery.imageFailed(0);
  assert.equal(calls, 1, 'duplicate image errors share one recovery request');
  assert.equal(expired.latest().url, '', 'remove the broken image while refreshing');
  await flush();
  assert.equal(expired.latest().url, 'fresh.jpg');
  const attempt = expired.latest().attempt;
  expired.recovery.imageLoaded(attempt);
  assert.equal(expired.latest().status, 'ready');
  expired.recovery.imageFailed(0);
  expired.recovery.imageLoaded(0);
  assert.equal(expired.latest().status, 'ready', 'late events from the expired image are ignored');
  expired.recovery.imageFailed(attempt);
  assert.equal(expired.latest().status, 'failed');
  assert.equal(calls, 1, 'a failed replacement does not start a signing loop');
  expired.recovery.retry();
  expired.recovery.retry();
  assert.equal(calls, 2, 'double clicking retry does not duplicate requests');
  await flush();
  assert.ok(expired.latest().attempt > attempt, 'even an identical URL gets a new image element on retry');
  expired.recovery.imageLoaded(expired.latest().attempt);
  assert.equal(expired.latest().status, 'ready');

  // A batch may omit individual paths, or fail before any thumbnail was signed.
  const missing = setup(undefined, async () => 'recovered.jpg');
  missing.recovery.start();
  await flush();
  assert.equal(missing.latest().url, 'recovered.jpg');
  missing.recovery.imageFailed(missing.latest().attempt);
  assert.equal(missing.latest().status, 'failed', 'initially missing images also get only one automatic attempt');

  for (const failure of ['offline', 'forbidden']) {
    let count = 0;
    const unavailable = setup(undefined, async () => {
      count++;
      if (failure === 'offline') throw new Error('offline');
      return undefined;
    });
    unavailable.recovery.start();
    await flush();
    assert.equal(unavailable.latest().status, 'failed', `${failure} displays a retryable fallback`);
    assert.equal(unavailable.latest().url, '');
    unavailable.recovery.start();
    unavailable.recovery.imageFailed(1);
    await flush();
    assert.equal(count, 1, 'missing or unauthorized files do not loop');
  }

  let online = false;
  const reconnected = setup('initial.jpg', async () => {
    if (!online) throw new Error('offline');
    return 'online.jpg';
  });
  reconnected.recovery.imageFailed(0);
  await flush();
  assert.equal(reconnected.latest().status, 'failed');
  online = true;
  reconnected.recovery.retry();
  await flush();
  assert.equal(reconnected.latest().url, 'online.jpg', 'manual retry works after reconnecting');

  // Navigation/path replacement must discard the old asynchronous response.
  for (const rejects of [false, true]) {
    let settle;
    const abandoned = setup(undefined, () => new Promise((resolve, reject) => {
      settle = () => rejects ? reject(new Error('late error')) : resolve('old-path.jpg');
    }));
    abandoned.recovery.start();
    abandoned.recovery.stop();
    const count = abandoned.changes.length;
    settle();
    await flush();
    abandoned.recovery.retry();
    abandoned.recovery.imageLoaded(1);
    abandoned.recovery.imageFailed(1);
    assert.equal(abandoned.changes.length, count, 'unmounted thumbnails ignore late requests and events');
  }
  console.log('PASS: expired/missing thumbnails, bounded recovery, manual retry, duplicate requests and stale events');
})().catch(error => { console.error(error); process.exitCode = 1; });
