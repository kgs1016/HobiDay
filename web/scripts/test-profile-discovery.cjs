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
  const { isBasicProfileComplete, isProfileComplete } = load('profileGate.ts');
  const basic = { nickname: '선택 공개 회원', gender: 'f', age: 27, photo: 'member/photo.jpg', area: '', level: null, homeGym: '', mbti: '', isPublic: false };
  assert.equal(isBasicProfileComplete(basic), true, 'a private member with a photo can browse without a career');
  assert.equal(isProfileComplete(basic), false, 'meeting/chat participation still needs a complete profile');
  const complete = { ...basic, careerId: 2 };
  assert.equal(isProfileComplete(complete), true, 'a complete private profile can participate without opting in to discovery');
  for (const isPublic of [false, true]) {
    for (const photo of [undefined, '', ' ']) {
      const withoutPhoto = { ...complete, photo, isPublic };
      assert.equal(isBasicProfileComplete(withoutPhoto), false, 'a photo is required even when discovery is private');
      assert.equal(isProfileComplete(withoutPhoto), false, 'participation also requires a photo');
    }
  }
  for (const invalid of [null, { ...basic, nickname: '' }, { ...basic, age: 18 }, { ...basic, age: 61 }]) {
    assert.equal(isBasicProfileComplete(invalid), false, 'required member information remains validated');
  }

  let stored;
  const sb = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'member' } } } }) },
    from: () => ({
      upsert: async row => { stored = row; return { error: null }; },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stored, error: null }) }) }),
    }),
  };
  const api = load('supabase.ts', {
    require: name => name === '@supabase/supabase-js' ? { createClient: () => sb } : {},
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

  const storage = new Map();
  const local = load('myProfile.ts', { window: {}, localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } });
  for (const isPublic of [false, true, false]) {
    local.saveMyProfile({ ...complete, isPublic });
    assert.equal(local.loadMyProfile().isPublic, isPublic, 'local previews retain the same explicit visibility choice');
  }
  console.log('PASS: private browsing, participation requirements, opt-in/out persistence and profile editing');
})().catch(error => { console.error(error); process.exitCode = 1; });
