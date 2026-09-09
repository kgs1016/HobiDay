const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, globals = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, ...globals });
  return exports;
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const result = find(child, predicate);
    if (result) return result;
  }
}

(async () => {
  const storage = new Map();
  const preferences = load('lib/loginPreferences.ts', { window: { localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  } } });
  assert.equal(preferences.readRememberedEmail(), '');
  preferences.rememberEmail(' previous@example.test ');
  assert.equal(preferences.readRememberedEmail(), 'previous@example.test');

  for (const globals of [{}, { window: { get localStorage() { throw Error('blocked'); } } }]) {
    const unavailable = load('lib/loginPreferences.ts', globals);
    assert.equal(unavailable.readRememberedEmail(), '', 'SSR/blocked storage starts with an empty email');
    assert.doesNotThrow(() => unavailable.rememberEmail('member@example.test'));
    assert.doesNotThrow(() => unavailable.rememberEmail(null));
  }

  let states = [];
  let cursor = 0;
  let credentials;
  let destination;
  let authResult = { error: null };
  let rejectNetwork = false;
  const jsx = (type, props) => ({ type, props });
  const imports = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: {
      useEffect: () => {},
      useState: initial => {
        const index = cursor++;
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
        return [states[index], value => { states[index] = value; }];
      },
    },
    'next/link': { default: 'a' },
    'next/navigation': { useRouter: () => ({ replace: value => { destination = value; } }) },
    '@/lib/supabase': { getSupabase: () => ({ auth: { signInWithPassword: async value => {
      credentials = value;
      if (rejectNetwork) throw Error('offline');
      return authResult;
    } } }) },
    '@/lib/browserState': { useHydrated: () => true },
    '@/lib/loginPreferences': preferences,
    '@/components/OAuthButtons': { default: 'oauth-buttons' },
    '@/components/icons': { ChevronLeftIcon: 'back-icon' },
  };
  const { default: Login } = load('app/login/page.tsx', {
    require: name => {
      assert.ok(name in imports, `unexpected import: ${name}`);
      return imports[name];
    },
    FormData: class {
      constructor(form) { this.fields = form.fields; }
      get(name) { return this.fields[name] ?? null; }
    },
  });
  const formComponent = find(Login(), node => typeof node.type === 'function').type;
  const render = () => { cursor = 0; return formComponent(); };
  const input = (form, name) => find(form, node => node.type === 'input' && node.props.name === name);
  const checkbox = form => find(form, node => node.type === 'input' && node.props.type === 'checkbox');
  const submit = form => form.props.onSubmit({
    preventDefault() {},
    // Values placed directly in the form, as a password manager may do without a React change event.
    currentTarget: { fields: { username: ' autofilled@example.test ', password: 'autofilled-secret' } },
  });

  let form = render();
  assert.equal(input(form, 'username').props.defaultValue, 'previous@example.test');
  assert.equal(checkbox(form).props.checked, true);
  assert.equal(input(form, 'username').props.autoComplete, 'username');
  assert.equal(input(form, 'password').props.autoComplete, 'current-password');
  assert.equal(input(form, 'password').props.defaultValue, undefined);
  await submit(form);
  assert.equal(credentials.email, 'autofilled@example.test');
  assert.equal(credentials.password, 'autofilled-secret');
  assert.equal(destination, '/me');
  assert.equal(preferences.readRememberedEmail(), 'autofilled@example.test');
  assert.deepEqual([...storage.values()], ['autofilled@example.test'], 'only the email is persisted, never the password');

  states = []; // Next visit restores the remembered email but no password.
  form = render();
  assert.equal(input(form, 'username').props.defaultValue, 'autofilled@example.test');
  checkbox(form).props.onChange({ target: { checked: false } });
  assert.equal(storage.size, 0, 'opting out clears the stored email immediately, without another login');
  await submit(render());
  assert.equal(storage.size, 0, 'a successful login with remember disabled must not save an email');

  preferences.rememberEmail('previous@example.test');
  for (const networkFailure of [false, true]) {
    states = [];
    destination = undefined;
    rejectNetwork = networkFailure;
    authResult = { error: { message: 'Invalid login credentials' } };
    await submit(render());
    assert.equal(destination, undefined, 'failed login must not navigate');
    assert.equal(preferences.readRememberedEmail(), 'previous@example.test', 'failed login must not overwrite a saved email');
    const failedForm = render();
    assert.ok(find(failedForm, node => node.props?.role === 'alert'));
    assert.equal(find(failedForm, node => node.type === 'button').props.disabled, false, 'a failed login can be retried');
  }
  console.log('PASS: remembered email opt-in/out, autofilled credentials, success-only persistence and login retry');
})().catch(error => { console.error(error); process.exitCode = 1; });
