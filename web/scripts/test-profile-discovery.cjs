const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib', file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, ...globals });
  return exports;
}

(async () => {
  const { isBasicProfileComplete } = load('profileGate.ts');
  const basic = { nickname: '선택 공개 회원', gender: 'f', age: 27, photo: 'member/photo.jpg', area: '', level: null, homeGym: '', mbti: '', isPublic: false };
  assert.equal(isBasicProfileComplete(basic), true, 'a private member with a photo can browse without a career');
  const complete = { ...basic, careerId: 2 };
  for (const isPublic of [false, true]) {
    for (const photo of [undefined, '', ' ']) {
      assert.equal(isBasicProfileComplete({ ...complete, photo, isPublic }), true, 'photo is optional');
    }
  }
  for (const invalid of [null, { ...basic, nickname: '' }, { ...basic, age: 18 }, { ...basic, age: 61 }]) {
    assert.equal(isBasicProfileComplete(invalid), false, 'required member information remains validated');
  }

  let stored;
  let readError = null;
  const signedPaths = [];
  const avatars = load("defaultAvatar.ts");
  const sb = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'member' } } } }) },
    storage: { from: () => ({ createSignedUrls: async paths => { signedPaths.push(...paths); return { data: paths.map(path => ({path, signedUrl:"https://storage.test/"+path})) }; } }) },
    rpc: async name => { assert.equal(name,"ensure_my_profile"); stored = { nickname:"클라이머-member",gender:null,age:null,photo:avatars.defaultAvatar(),is_public:false }; return { data:stored,error:null }; },
    from: () => ({
      upsert: async row => { stored = row; return { error: null }; },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stored, error: readError }) }) }),
    }),
  };
  const api = load('supabase.ts', {
    require: name => name === '@supabase/supabase-js' ? { createClient: () => sb } : name === './defaultAvatar' ? avatars : {},
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'http://local.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } },
  });
  await api.upsertMyProfileDb(basic, false);
  assert.equal(stored.is_public, false, 'saving basic information must not publish a new member');
  assert.equal(stored.photo, basic.photo);
  assert.equal(stored.career, null);
  for (const visibility of [true, false]) {
    await api.upsertMyProfileDb(complete, visibility);
    const reloaded = await api.fetchMyProfileDb();
    assert.equal(reloaded.isPublic, visibility, 'the saved opt-in or opt-out survives reloading');
    await api.upsertMyProfileDb({ ...reloaded, intro: 'edited' }, reloaded.isPublic);
    assert.equal(stored.is_public, visibility, 'editing other fields must preserve the saved visibility');
  }
  const { VISIT_FREQUENCIES, visitFrequencyLabel } = load('visitFrequency.ts');
  assert.equal(visitFrequencyLabel(undefined), null, 'old profiles do not get an invented frequency');
  for (const option of VISIT_FREQUENCIES) {
    await api.upsertMyProfileDb({ ...complete, visitFrequency: option.id }, false);
    const reloaded = await api.fetchMyProfileDb();
    assert.equal(reloaded.visitFrequency, option.id, 'frequency persists across profile reloads');
    assert.equal(visitFrequencyLabel(reloaded.visitFrequency), option.label);
  }
  await api.upsertMyProfileDb({ ...complete, visitFrequency: undefined }, false);
  assert.equal(stored.visit_frequency, null, 'clearing a choice persists null');
  assert.equal((await api.fetchMyProfileDb()).visitFrequency, undefined);

  stored = null;
  readError = { message: 'offline' };
  assert.equal(await api.fetchMyProfileDb(), null, 'failed query never creates or overwrites a profile');
  readError = null;
  const empty = await api.fetchMyProfileDb();
  assert.equal(empty.gender, null); assert.equal(empty.age, null); assert.equal(empty.isPublic, false);
  const defaults = [avatars.defaultAvatar('m'), avatars.defaultAvatar('f'), avatars.defaultAvatar(null)];
  const urls = await api.signedPhotoUrls([...defaults, 'member/real.jpg']);
  for (const key of defaults) assert.equal(urls[key], key, 'bundled avatars need no storage signature');
  assert.deepEqual(signedPaths, ['member/real.jpg']);
  assert.equal(avatars.isDefaultAvatar('https://untrusted.test/photo.svg'), false);

  const storage = new Map();
  const local = load('myProfile.ts', { window: {}, localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } });
  for (const isPublic of [false, true, false]) {
    local.saveMyProfile({ ...complete, isPublic });
    assert.equal(local.loadMyProfile().isPublic, isPublic, 'local previews retain the same explicit visibility choice');
  }
  console.log('PASS: optional photos, private browsing, opt-in/out persistence and profile editing');
})().catch(error => { console.error(error); process.exitCode = 1; });
