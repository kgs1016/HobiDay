const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, globals) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib', file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, console, ...globals });
  return exports;
}

async function uploadCase({ profileError = null, listError = null } = {}) {
  let uploaded;
  const removed = [];
  const bucket = {
    upload: async object => { uploaded = object; return { error: null }; },
    list: async () => ({ data: [{ name: 'current.jpg' }, { name: 'unused.jpg' }], error: listError }),
    remove: async names => { removed.push(...names); return { error: null }; },
  };
  const sb = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } } }) },
    storage: { from: () => bucket },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { photo: 'owner/current.jpg' }, error: profileError }) }) }) }),
  };
  const api = load('supabase.ts', {
    require: name => name === '@supabase/supabase-js' ? { createClient: () => sb } : {},
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'http://local.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } },
  });
  const result = await api.uploadProfilePhoto({ name: 'new.jpg', type: 'image/jpeg', size: 100 });
  assert.equal(result.path, uploaded, 'successful new photo remains available');
  return removed;
}

async function checkBitmapCleanup() {
  for (const drawFails of [false, true]) {
    let closed = 0;
    const { downscaleImage } = load('imageResize.ts', {
      createImageBitmap: async () => ({ width: drawFails ? 3000 : 100, height: 100, close: () => closed++ }),
      document: { createElement: () => ({ getContext: () => ({ drawImage: () => { throw new Error('decode failed'); } }) }) },
    });
    const file = { name: 'photo.jpg', type: 'image/jpeg', size: 400 * 1024 };
    assert.equal(await downscaleImage(file), file);
    assert.equal(closed, 1, 'decoded bitmap is released on both unchanged-image and failed-resize paths');
  }
}

(async () => {
  assert.deepEqual(await uploadCase(), ['owner/unused.jpg'], 'never delete the photo still referenced by the profile');
  assert.deepEqual(await uploadCase({ profileError: { message: 'offline' } }), [], 'failed profile lookup must not delete any old photo');
  assert.deepEqual(await uploadCase({ listError: { message: 'offline' } }), [], 'failed storage listing must not delete any old photo');
  await checkBitmapCleanup();
  console.log('PASS: current photo preservation, failed-lookup safety and decoded-image cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
