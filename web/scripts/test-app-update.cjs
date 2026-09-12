const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/lib/appUpdate.ts'), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const api = {};
vm.runInNewContext(code, { exports: api });

const policy = {
  ios_latest_version: '1.2', android_latest_version: '1.3',
  ios_minimum_version: '1.0', android_minimum_version: '1.2',
  title: '업데이트', message: '새 버전',
};
assert.equal(api.compareVersions('1.1', '1.1.0'), 0);
assert.equal(api.compareVersions('1.10', '1.2'), 1);
assert.equal(api.compareVersions('1.1', '1.2'), -1);
assert.equal(api.compareVersions('broken', '1.2'), null);
assert.equal(api.updateDecision('1.1', 'ios', policy), 'available');
assert.equal(api.updateDecision('1.2', 'ios', policy), 'none');
assert.equal(api.updateDecision('1.1', 'android', policy), 'required');
assert.equal(api.updateDecision('1.3', 'android', policy), 'none');
assert.equal(api.isUpdateSnoozed('1000', 1000 + 23 * 60 * 60 * 1000), true);
assert.equal(api.isUpdateSnoozed('1000', 1000 + 25 * 60 * 60 * 1000), false);
assert.notEqual(api.updateSnoozeKey('ios', '1.2'), api.updateSnoozeKey('ios', '1.3'));
assert.match(api.STORE_URLS.ios, /6803351277/);
assert.match(api.STORE_URLS.android, /kr\.hobiday\.app/);
console.log('PASS app update: semantic versions, optional/required policy, version-specific snooze and store links');
