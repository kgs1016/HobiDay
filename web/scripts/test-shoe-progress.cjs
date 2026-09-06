// The rank rules must handle threshold boundaries, mixed grades and corrections.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/shoeProgress.ts'), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleExports = {};
vm.runInNewContext(output, { exports: moduleExports });
const { shoeProgress, SHOE_STAGES } = moduleExports;
const progress = grade_counts => shoeProgress({ total: Object.values(grade_counts).reduce((a,b) => a+b,0), grade_counts });

assert.equal(progress({}).current.id, 'white');
assert.equal(progress({ unknown: 100, '-1': 100, '0': 100 }).current.id, 'white');
assert.equal(progress({ '1': 300 }).current.id, 'yellow', 'low grades cannot buy a higher rank');
for (const stage of SHOE_STAGES.slice(1)) {
  assert.notEqual(progress({ [stage.minV]: stage.required - 1 }).current.id, stage.id, 'below threshold');
  assert.equal(progress({ [stage.minV]: stage.required }).current.id, stage.id, 'exact threshold');
}
assert.equal(progress({ '4': 6, '5': 3, '6': 1 }).current.id, 'blue', 'higher grades count toward lower conditions');
assert.equal(progress({ '4': 6, '5': 3, '6': 1 }).next.count, 1);
assert.equal(progress({ '8': 15 }).current.id, 'black', 'can start at highest qualified stage');
assert.equal(progress({ '8': 15 }).next, null, 'highest rank has no next goal');
assert.equal(progress({ '8': 14 }).current.id, 'purple', 'correction recomputes rank');
assert.equal(progress({ '3': 8 }).next.count, 0, 'next stage needs its own grade');
console.log('PASS: thresholds, mixed grades, unknown grades, highest-stage entry, corrections and next-stage progress');
