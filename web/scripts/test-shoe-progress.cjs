// The rank rules must handle threshold boundaries, mixed grades and corrections.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(name) {
  const source=fs.readFileSync(path.join(__dirname,'../src/lib',name+'.ts'),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};
  vm.runInNewContext(code,{exports,Date,require:id=>load(id.slice(2))});
  return exports;
}
const { shoeProgress, SHOE_STAGES, parseShoeAchievement, shoePeriodStart } = load('shoeProgress');
const { HOBI_DIFFICULTIES, difficultyScore } = load('hobiDifficulty');
const progress = difficulty_counts => shoeProgress({total:Object.values(difficulty_counts).reduce((a,b)=>a+b,0),grade_counts:{},difficulty_counts});
assert.equal(progress({}).current.id,'white');
assert.equal(progress({unknown:100,'1':10000}).current.id,'white','easy volume cannot replace difficulty requirements');
for (const stage of SHOE_STAGES.slice(1)) {
  const base=stage.required * HOBI_DIFFICULTIES[stage.minLevel-1].points;
  const counts={[stage.minLevel]:stage.required,'1':stage.points-base};
  assert.equal(progress(counts).points,stage.points);
  assert.equal(progress(counts).current.id,stage.id,'both exact thresholds');
  assert.notEqual(progress({...counts,'1':counts['1']-1}).current.id,stage.id,'one point short');
  assert.notEqual(progress({[stage.minLevel]:stage.required-1,'1':stage.points}).current.id,stage.id,'points alone do not bypass difficulty count');
}
assert.equal(progress({'6':10,'7':5,'1':150}).current.id,'red','mixed difficulties contribute weighted points');
assert.equal(progress({'6':10,'7':5,'1':150}).next.count,5);
assert.equal(progress({'11':79}).current.id,'black');
assert.equal(progress({'11':79}).next,null);
assert.equal(progress({'11':78}).current.id,'brown','deletion/correction recalculates points');
assert.equal(difficultyScore({'1':10,'6':5,'7':3,unknown:100}),124);
assert.equal(parseShoeAchievement({ stage: 'blue', total: 42 }).stage, 'blue');
assert.equal(parseShoeAchievement({ stage: 'white', total: 0 }).total, 0);
for (const invalid of [null, {}, { stage: 'gold', total: 10 }, { stage: 'yellow', total: 10 }, { stage: 'orange', total: 10 }, { stage: 'blue', total: -1 }, { stage: 'white', total: '0' }]) {
  assert.equal(parseShoeAchievement(invalid), undefined, 'missing or invalid summaries must not become an empty-record badge');
}
console.log('PASS: weighted points and difficulty gates, mixed records, highest-stage entry, corrections and next-stage progress');

assert.equal(SHOE_STAGES.length,9);
for (const [today,start] of [
 ['2026-09-09','2026-06-09'],['2026-01-31','2025-10-31'],
 ['2026-05-31','2026-02-28'],['2024-05-31','2024-02-29'],['2026-03-01','2025-12-01']
]) assert.equal(shoePeriodStart(today),start,'calendar three months with month-end clamp');
assert.equal(shoeProgress({total:100, recent_total:0, grade_counts:{}, difficulty_counts:{}}).current.count,0,'expired records do not fill stage');
for(const stage of SHOE_STAGES) assert.ok(fs.existsSync(path.join(__dirname,'../public/illustrations/climbing-shoe/',stage.id+'-v2.webp')),stage.id+' illustration exists');
const sql=fs.readFileSync(path.join(__dirname,'../../supabase/migrations/20260909220000_hobi_color_achievement.sql'),'utf8');
for(const stage of SHOE_STAGES.slice(1)) assert.ok(sql.includes("'"+stage.id+"',"+stage.minLevel+','+stage.required+','+stage.points+ ')'),'server/client policy parity');
console.log('PASS: nine colors, three calendar months, assets and server/client rule parity');
