const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/feedbackVideo.ts'), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const calls = [];
let failUpload = '', result = { data: { ok: true, id: 'post' }, error: null };
const storage = {
  upload: async (name) => { calls.push(['upload', name]); return { error: name.endsWith(failUpload) && failUpload ? new Error('offline') : null }; },
  remove: async (names) => { calls.push(['remove', ...names]); return { error: null }; },
};
const sb = { storage: { from: () => storage }, rpc: async (name, values) => { calls.push(['rpc', name, values]); return result; } };
const api = {};
vm.runInNewContext(code, { exports: api, crypto: { randomUUID: () => 'revision' },
  require: name => name === './community' ? { FEEDBACK_VIDEO_MAX_BYTES: 50 * 1024 * 1024 }
    : { getSupabase: () => sb, currentUser: async () => ({ id: 'owner' }) } });

(async () => {
  const previous = { video: 'old/video.mp4', thumbnail: 'old/thumbnail.jpg' };
  const file = { type: 'video/mp4', size: 1024 }, thumb = { type: 'image/jpeg', size: 512 };
  assert.equal(await api.uploadFeedbackReplacement('post', previous, null, null), previous);
  assert.equal(calls.length, 0, 'description-only edits do not upload files');
  await assert.rejects(api.uploadFeedbackReplacement('post', previous, { ...file, size: 60 * 1024 * 1024 }, thumb), /50MB/);
  await assert.rejects(api.uploadFeedbackReplacement('post', previous, file, null), /썸네일/);
  assert.equal(calls.length, 0, 'invalid files never reach storage');
  failUpload = 'thumbnail.jpg';
  await assert.rejects(api.uploadFeedbackReplacement('post', previous, file, thumb), /썸네일 업로드/);
  assert.equal(calls.at(-1)[0], 'remove');
  assert.deepEqual(calls.at(-1).slice(1), ['owner/post/revisions/revision/video.mp4']);
  assert.ok(!calls.flat().includes(previous.video), 'failure cleanup never touches the published video');
  calls.length = 0; failUpload = '';
  const thumbnailOnly = await api.uploadFeedbackReplacement('post', previous, null, thumb);
  assert.equal(thumbnailOnly.video, previous.video);
  assert.equal(calls.length, 1);
  calls.length = 0;
  const replacement = await api.uploadFeedbackReplacement('post', previous, file, thumb);
  assert.equal(calls.length, 2);
  assert.equal(previous.video, 'old/video.mp4');
  result = { data: null, error: { message: 'network response lost' } };
  await assert.rejects(api.updateFeedbackVideo('post', 'version', 'after', replacement), /재시도/);
  assert.ok(!calls.some(c => c[0] === 'remove'), 'ambiguous save must preserve potentially published uploads');
  const attempted = calls.at(-1);
  result = { data: { ok: true, id: 'post' }, error: null };
  await api.updateFeedbackVideo('post', 'version', 'after', replacement);
  assert.deepEqual(calls.at(-1), attempted, 'retry sends the same revision and expected version');
  for (const [error, message] of [['conflict', /다른 화면/], ['profile_incomplete', /profile_incomplete/], ['not_mine', /내가 올린/]]) {
    result = { data: { error }, error: null };
    await assert.rejects(api.updateFeedbackVideo('post', 'version', 'after', replacement), message);
  }
  console.log('Content editing: upload failures, safe replacement, text/thumbnail-only edits, retry and conflicts passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
