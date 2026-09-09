const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const entries = new Map();
const storage = {
  getItem: key => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, value),
  removeItem: key => entries.delete(key),
};
function load(file, window = { localStorage: storage, sessionStorage: storage }) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, window, Date, encodeURIComponent,
    require: id => { assert.ok(id.startsWith('./')); return load(id.slice(2) + '.ts', window); },
  });
  return exports;
}
const guide = load('gymGrades.ts');
assert.equal(guide.GYM_GRADE_GUIDES.length, 10, 'one entry per brand');
assert.equal(new Set(guide.GYM_GRADE_GUIDES.map(item => item.id)).size, 10);
for (const name of ['서울숲', '서울숲클라이밍', '서울숲 클라이밍 영등포점', '서울숲 구로점', '영등숲']) {
  assert.equal(guide.findGymGradeGuide(name).id, 'seoul-forest', 'branch links resolve to a shared brand guide');
}
for (const other of ['을지로 담장 클라이밍', '더클라임뉴스', '서울숲 근처 신촌담장', '피커스뉴스', '']) {
  assert.equal(guide.findGymGradeGuide(other), undefined, 'unrelated gyms and prose never inherit a brand');
}
assert.equal(guide.findGymGradeGuide('피커스 구로').id, guide.findGymGradeGuide('피커스 종로').id);
assert.equal(guide.findGymGradeGuide('피커스 클라이밍 신촌점').id, 'peakers');
assert.equal(guide.findGymGradeGuide('피커스 종로').colors.at(-1).name, '검정');
assert.match(guide.findGymGradeGuide('피커스 종로').note, /회색/, 'retain the older source discrepancy');
assert.equal(guide.findGymGradeGuide('알레클라이밍 혜화점').id, 'allez');
assert.match(guide.findGymGradeGuide('알레클라이밍 혜화점').note, /혜화/);
assert.equal(guide.findGymGradeGuide('알레 영등포').colors[2].name, '연두');
assert.equal(guide.findGymGradeGuide('코알라 킨텍스').id, 'koala');
const aliases = new Set();
for (const item of guide.GYM_GRADE_GUIDES) {
  assert.ok(item.colors.length >= 2);
  assert.equal(new Set(item.colors.map(color => color.name)).size, item.colors.length);
  for (const color of item.colors) assert.match(color.hex, /^#[0-9a-f]{6}$/i, 'every named color must render');
  const localAliases = new Set([item.name, ...item.aliases].map(value => value.toLowerCase().replace(/\s+/g, '')));
  for (const alias of localAliases) {
    assert.ok(!aliases.has(alias), `ambiguous gym alias: ${alias}`);
    aliases.add(alias);
  }
  assert.ok(item.sources.length > 0);
  assert.equal(new Set(item.sources.map(source => source.url)).size, item.sources.length);
  for (const source of item.sources) {
    assert.equal(new URL(source.url).protocol, 'https:');
    if (source.published !== null) {
      assert.match(source.published, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(source.published <= source.checked, 'publication and review dates are different facts');
    }
  }
}
const brand = guide.findGymGradeGuide('서울숲');
assert.equal(guide.matchesGradeGuide(brand, '서울 영등숲'), true);
assert.equal(guide.matchesGradeGuide(brand, '영등포 서울숲'), true);
assert.equal(guide.matchesGradeGuide(brand, '서울숲 뚝섬점'), true);
assert.equal(guide.matchesGradeGuide(brand, '클라이밍파크'), false);
assert.equal(guide.GYM_GRADE_GUIDES.filter(item => guide.matchesGradeGuide(item, '서울숲')).length, 1);
const url = new URL(guide.gymGradeGuideHref(' A&B #1? '), 'https://example.com');
assert.equal(url.pathname, '/me/grades');
assert.equal(url.searchParams.get('gym'), 'A&B #1?');
assert.equal(url.searchParams.get('tab'), 'gyms');
assert.equal(new URL(guide.gymGradeGuideHref('   '), url).searchParams.has('gym'), false);
const recentKey = 'hobiday:grade-guide-recent';
for (const bad of ['broken', '{}', 'null', '[3,null,{},""]']) {
  entries.set(recentKey, bad);
  assert.equal(guide.readRecentGradeGyms().length, 0);
}
entries.set(recentKey, JSON.stringify(['서울숲클라이밍 영등포점', '서울숲클라이밍 구로점', '피커스 클라이밍 종로점', 'unknown']));
assert.equal(JSON.stringify(guide.readRecentGradeGyms()), '["서울숲클라이밍","피커스"]', 'migrate legacy visits without duplicated brands');
for (const name of ['신촌담장', '알레 강동', '서울숲 잠실점', '피커스 구로', '알레 영등포']) guide.rememberGradeGym(name);
assert.equal(JSON.stringify(guide.readRecentGradeGyms()), '["알레클라이밍","피커스","서울숲클라이밍"]');
assert.equal(JSON.stringify(guide.rememberGradeGym('unknown')), JSON.stringify(guide.readRecentGradeGyms()));
const blocked = new Proxy({}, { get() { throw Error('blocked storage'); } });
assert.equal(load('gymGrades.ts', blocked).readRecentGradeGyms().length, 0);
assert.doesNotThrow(() => load('gymGrades.ts', blocked).rememberGradeGym('a'));

const draftApi = load('ascentGuideDraft.ts');
const recordApi = load('ascentRecord.ts');
for (const name of ['더클라임', '더 클라임', '더클라임 강남점', '더클라임 문래점', '더클라임 신림점', '더클 일산점', 'The Climb']) {
  assert.equal(guide.findGymGradeGuide(name).id, 'theclimb', 'The Climb branches share the brand guide');
  assert.equal(recordApi.ascentPalette(name).length, 11, 'recording uses the eleven gym colors, separate from nine shoe stages');
}
assert.equal(recordApi.ascentPalette('더클라임 강남점')[6].name, '핑크');
assert.equal(recordApi.colorAscentEntry('더클라임 강남점', '핑크', 3).v_grade, null, 'no invented V conversion for a known gym color');
const draft = { gym: '신촌담장', completed_on: recordApi.ascentToday(), items: [{color:'파랑',quantity:6,v_grade:null},{color:'빨강',quantity:4,v_grade:4}],
  legacyId: null, recordId: '00000000-0000-4000-8000-000000000001' };
assert.equal(recordApi.ascentDraftError(draft), null, 'multiple colors and counts are valid');
assert.equal(recordApi.ascentToday(new Date('2026-09-08T15:01:00Z')), '2026-09-09', 'Korean date boundary');
for (const invalid of [
  {...draft, completed_on:'2026-02-30'}, {...draft, completed_on:'2099-01-01'}, {...draft, gym:' '}, {...draft, items:[]},
  {...draft, items:[{color:'빨강',quantity:1.5,v_grade:null}]}, {...draft, items:[{color:'빨강',quantity:100,v_grade:null}]},
  {...draft, items:[{color:'빨강',quantity:1,v_grade:18}]}, {...draft, items:[{color:'빨강',quantity:0,v_grade:null}]},
  {...draft, items:[{color:'빨강',quantity:1,v_grade:null},{color:' 빨강 ',quantity:2,v_grade:null}]},
  {...draft, items:Array.from({length:6},(_,i)=>({color:String(i),quantity:99,v_grade:null}))},
]) assert.notEqual(recordApi.ascentDraftError(invalid), null);
const legacyDraft = recordApi.draftFromAscent({id:draft.recordId,kind:'legacy',gym:'old',completed_on:null,items:[{color:null,quantity:1,v_grade:4}]});
assert.equal(legacyDraft.completed_on, '', 'do not invent an ascent date from the creation time');
assert.equal(legacyDraft.legacyId, draft.recordId);
draftApi.saveAscentGuideDraft('one', draft);
assert.equal(draftApi.takeAscentGuideDraft('two'), null, 'drafts belong to the same user only');
assert.deepEqual(JSON.parse(JSON.stringify(draftApi.takeAscentGuideDraft('one'))), draft);
assert.equal(draftApi.takeAscentGuideDraft('one'), null, 'restore only once');
const draftKey = 'hobiday:ascent-guide-draft:one';
for (const invalid of [
  { ...draft, savedAt: Date.now() - 3_600_001 },
  { ...draft, savedAt: Date.now() + 60_000 },
  { ...draft, savedAt: Date.now(), items:[{color:'빨강',quantity:-1,v_grade:null}] },
  { ...draft, savedAt: Date.now(), recordId: 'not-an-id' },
]) {
  entries.set(draftKey, JSON.stringify(invalid));
  assert.equal(draftApi.takeAscentGuideDraft('one'), null);
}
entries.set(draftKey, 'invalid JSON');
assert.equal(draftApi.takeAscentGuideDraft('one'), null);
assert.doesNotThrow(() => load('ascentGuideDraft.ts', blocked).saveAscentGuideDraft('one', draft));
assert.equal(load('ascentGuideDraft.ts', blocked).takeAscentGuideDraft('one'), null);
draftApi.saveAscentGuideDraft('one', draft);
draftApi.clearAscentGuideDraft('one');
assert.equal(draftApi.takeAscentGuideDraft('one'), null);
console.log(`PASS: ${guide.GYM_GRADE_GUIDES.length} brand guides, links, source differences, recent brands, bulk input validation and isolated draft restore`);

const mappingApi = load('gymGradeMappings.ts');
const mappings = mappingApi.GYM_GRADE_MAPPINGS;
const migrationDir = path.join(__dirname, '../../supabase/migrations');
const sqlSeed = fs.readdirSync(migrationDir).filter(name => name.endsWith('.sql')).sort().flatMap(name => {
  const source = fs.readFileSync(path.join(migrationDir, name), 'utf8');
  return [...source.matchAll(/\$grade_mappings\$([\s\S]*?)\$grade_mappings\$/g)].flatMap(match => JSON.parse(match[1]));
});
assert.deepEqual(sqlSeed, JSON.parse(JSON.stringify(mappings.map(m => ({
  id:m.id,brand_id:m.brandId,color:m.color,v_min:m.min,v_max:m.max,
  source_url:m.sourceUrl,source_label:m.sourceLabel,published_on:m.publishedOn,checked_on:m.checkedOn,
})))), 'client and SQL must share exactly the same published mapping versions');
assert.equal(mappingApi.findGradeMapping('seoul-forest', '파랑'), undefined, 'no V from color order');
assert.equal(mappingApi.findGradeMapping('metrorock', '핑크'), undefined, 'pink downclimb hold is not a difficulty');
assert.equal(mappingApi.gradeMappingLabel(mappingApi.findGradeMapping('metrorock', '파랑')), 'V3–V4');
assert.equal(mappingApi.gradeMappingLabel(mappingApi.findGradeMapping('metrorock', '검정')), 'V5+');
assert.equal(mappingApi.gradeMappingLabel(mappingApi.findGradeMapping('theclimb', '흰색')), 'VB');
assert.equal(recordApi.ascentGradeLabel(-1), 'VB');
for (const [color, grade] of [['흰색', -1], ['노랑', 0], ['주황', 1], ['초록', 2], ['파랑', 3], ['빨강', 4]]) {
  for (const name of ['더클라임', 'The Climb', '더클라임 사당점', '더클 일산점']) {
    const item = recordApi.colorAscentEntry(name, color, 5);
    assert.equal(item.v_grade, grade);
    assert.ok(item.grade_mapping_id);
    assert.equal(recordApi.ascentDraftError({...draft,gym:name,items:[item]}), null);
  }
}
for (const color of ['핑크', '보라', '회색', '갈색', '검정']) {
  assert.equal(mappingApi.findGradeMapping('theclimb', color), undefined, 'post-pink upper grades need a separate source');
}
assert.equal(recordApi.colorAscentEntry('더클라임뉴스', '파랑', 1).grade_mapping_id, null);
const sourceVersion = recordApi.colorAscentEntry('더클라임 강남점', '파랑', 10);
assert.equal(recordApi.changeAscentGym({...draft,gym:'더클라임 강남점',items:[sourceVersion]}, '메트로락').items[0].grade_mapping_id,
  'metrorock-20260909-blue', 'same grade but a new gym must switch source versions');
const auto = recordApi.colorAscentEntry('메트로락 클라이밍', '파랑', 10);
assert.equal(auto.v_grade, 3, 'range uses lower bound, never the upper grade');
assert.equal(auto.grade_mapping_id, 'metrorock-20260909-blue');
const autoDraft = {...draft,gym:'메트로락 클라이밍',items:[auto]};
assert.equal(recordApi.ascentDraftError(autoDraft), null);
for (const bad of [
  {...autoDraft,gym:'서울숲'}, {...autoDraft,items:[{...auto,v_grade:4}]},
  {...autoDraft,items:[{...auto,color:'민트'}]}, {...autoDraft,items:[{...auto,grade_mapping_id:'invented'}]},
]) assert.notEqual(recordApi.ascentDraftError(bad), null);
const cleared = recordApi.changeAscentGym(autoDraft, '');
assert.equal(cleared.items[0].v_grade, null, 'do not carry a grade into another gym');
assert.equal(recordApi.changeAscentGym(cleared, '메트로락').items[0].v_grade, 3, 'typing the name rematches');
assert.equal(recordApi.changeAscentGym(autoDraft, '피커스').items[0].grade_mapping_id, null);
const manualDraft = {...draft,gym:'우리동네 새 암장',gym_mode:'other',items:[{color:'민트',quantity:9,v_grade:2,grade_mapping_id:null,custom_color:true}]};
assert.equal(recordApi.ascentDraftError(manualDraft), null);
assert.equal(recordApi.changeAscentGym(manualDraft, '서울숲').items[0].v_grade, 2, 'manual grades remain explicit');
const unknown = {...manualDraft,items:[{...manualDraft.items[0],v_grade:null}]};
assert.equal(recordApi.ascentDraftError(unknown), null, 'custom colors may have no V grade');
assert.equal(recordApi.ascentDraftError({...unknown,items:[{...unknown.items[0],color:'  '}]}), '색상과 완등 개수를 선택해주세요');
draftApi.saveAscentGuideDraft('custom', manualDraft);
assert.deepEqual(JSON.parse(JSON.stringify(draftApi.takeAscentGuideDraft('custom'))), manualDraft);
draftApi.saveAscentGuideDraft('auto', autoDraft);
assert.deepEqual(JSON.parse(JSON.stringify(draftApi.takeAscentGuideDraft('auto'))), JSON.parse(JSON.stringify(autoDraft)));
const restored = recordApi.draftFromAscent({...autoDraft,id:draft.recordId,kind:'batch'});
assert.equal(restored.items[0].grade_mapping_id, auto.grade_mapping_id, 'editing keeps attribution');
const customRestored = recordApi.draftFromAscent({...manualDraft,id:draft.recordId,kind:'batch'});
assert.equal(customRestored.items[0].custom_color, true, 'editing unknown colors keeps the name editable');
console.log('PASS: source-backed range mapping, SQL parity, gym changes, manual input, unknown grades and attribution restore');

const hobi = load('hobiDifficulty.ts');
const hobiSql = fs.readFileSync(path.join(migrationDir, '20260909220000_hobi_color_achievement.sql'), 'utf8');
const brandSeed = JSON.parse(hobiSql.split('$hobi_brands$')[1]);
assert.deepEqual(brandSeed, JSON.parse(JSON.stringify(guide.GYM_GRADE_GUIDES.map(g => ({id:g.id,
  aliases:[...new Set([g.id,g.name,...g.aliases].map(s=>s.toLowerCase().replace(/\s+/g,'')))],
  prefixes:g.branchPrefixes.map(s=>s.toLowerCase().replace(/\s+/g,'')),colors:g.colors.map(c=>c.name)
})))), 'SQL and client normalize exactly the same brand/color policy');
for (const g of guide.GYM_GRADE_GUIDES) {
  const levels = g.colors.map(c => hobi.colorDifficulty(g.name,c.name));
  assert.equal(levels[0].level,1);
  assert.equal(levels.at(-1).level,11);
  for (let i=1;i<levels.length;i++) {
    assert.ok(levels[i].level>levels[i-1].level);
    assert.ok(levels[i].points>levels[i-1].points);
  }
  for (const name of [g.id,g.name,...g.aliases]) assert.equal(hobi.colorDifficulty(name,g.colors[0].name).level,1);
}
assert.equal(hobi.colorDifficulty('더클라임','파랑').points,8);
assert.equal(hobi.colorDifficulty('더클라임','빨강').points,12);
assert.equal(hobi.colorDifficulty('더클라임','핑크').points,18);
assert.equal(hobi.colorDifficulty('메트로락','빨강').points,1,'same color in another gym has its own difficulty');
assert.equal(hobi.colorDifficulty('더클라임뉴스','파랑'),null);
assert.equal(hobi.ascentDifficulty('피커스',{color:'보라',v_grade:null}).points,26,'unknown V still earns color points');
assert.equal(hobi.ascentDifficulty('새 암장',{color:'민트',v_grade:null,manual_difficulty:7}).points,18);
assert.equal(hobi.ascentDifficulty('새 암장',{color:'민트',v_grade:null}),null);
assert.equal(hobi.ascentDifficulty('더클라임',{color:'흰색',v_grade:17,manual_difficulty:11}).level,1,'known colors never inherit a claimed V or manual difficulty');
const manualH = {...manualDraft, items:[{...manualDraft.items[0],v_grade:null,manual_difficulty:7}]};
assert.equal(recordApi.ascentDraftError(manualH),null);
for (const bad of [0,12,1.5,'7']) assert.notEqual(recordApi.ascentDraftError({...manualH,items:[{...manualH.items[0],manual_difficulty:bad}]}),null);
assert.equal(recordApi.changeAscentGym({...manualH,items:[{...manualH.items[0],color:'파랑'}]},'더클라임').items[0].manual_difficulty,null);
draftApi.saveAscentGuideDraft('manual-h',manualH);
assert.deepEqual(JSON.parse(JSON.stringify(draftApi.takeAscentGuideDraft('manual-h'))),manualH);
console.log('PASS: all brand colors, relative weighting, no fabricated V, manual difficulty, draft restore and policy parity');
