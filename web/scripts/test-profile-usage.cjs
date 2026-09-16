const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const {webcrypto}=require('node:crypto');
function compile(name){return ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib',name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;}
const network={};vm.runInNewContext(compile('network.ts'),{exports:network,Promise,Error,DOMException,AbortController,setTimeout,clearTimeout});
function setup({mode='production',enabled,platform='web',session=true,hang=false,fail=false,nativeFails=false}={}){
  const calls=[],effects=[],ref={current:false};let token='account-A',infoCalls=0;
  const sb={auth:{getSession:async()=>({data:{session:session?{access_token:token,user:{id:token}}:null},error:null})},rpc:(name,args)=>{
    const headers={};return {setHeader(k,v){headers[k]=v;return this;},abortSignal(signal){calls.push({name,args,headers,signal});return hang?new Promise(()=>{}):Promise.resolve({data:true,error:fail?{message:'private server detail'}:null});}};
  }};
  const api={};
  vm.runInNewContext(compile('profileUsage.ts'),{exports:api,Error,Promise,Date,crypto:webcrypto,Uint8Array,window:{},navigator:{onLine:true},process:{env:{NODE_ENV:mode,NEXT_PUBLIC_PROFILE_USAGE_ENABLED:enabled}},require:name=>({
    react:{useRef:()=>ref,useEffect:fn=>effects.push(fn)},
    '@capacitor/core':{Capacitor:{isNativePlatform:()=>platform!=='web',getPlatform:()=>platform}},
    '@capacitor/app':{App:{getInfo:async()=>{infoCalls++;if(nativeFails)throw Error('unavailable');return {version:'1.1.1'};}}},
    './supabase':{getSupabase:()=>sb},
    './network':{withDeadline:(task,ms,parent)=>network.withDeadline(task,Math.min(ms??15000,30),parent)},
  })[name]});
  return {api,calls,effects,token:value=>{token=value;},infoCalls:()=>infoCalls};
}
async function flush(){for(let i=0;i<45;i++)await Promise.resolve();}
async function checkAdminScreen(){
  const slots=[],cleanups=[],pending=[];let index=0,authChanged,unsubscribed=false;
  const jsx=(type,props)=>({type,props});
  const react={
    useState:initial=>{const i=index++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef:initial=>{const i=index++;return slots[i]??={current:initial};},
    useEffect:(fn,deps)=>{const i=index++;if(!slots[i]||deps.some((d,j)=>d!==slots[i][j])){cleanups[i]?.();slots[i]=deps;cleanups[i]=fn();}},
  };
  const api={};
  const source=fs.readFileSync(path.join(__dirname,'../src/app/admin/usage/page.tsx'),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports:api,Error,Promise,require:name=>({
    react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/components/BackButton':{default:'back'},
    '@/lib/supabase':{getSupabase:()=>({auth:{onAuthStateChange:fn=>{authChanged=fn;return {data:{subscription:{unsubscribe(){unsubscribed=true;}}}};}}})},
    '@/lib/profileUsage':{PROFILE_USAGE_EVENTS:setup().api.PROFILE_USAGE_EVENTS,fetchProfileUsageReport:(days,newOnly)=>new Promise((resolve,reject)=>pending.push({days,newOnly,resolve,reject}))},
  })[name]});
  const render=()=>{index=0;return api.default();};
  const text=node=>node==null?'':Array.isArray(node)?node.map(text).join(''):typeof node==='object'?text(node.props?.children):String(node);
  const find=(node,predicate)=>Array.isArray(node)?node.map(n=>find(n,predicate)).find(Boolean):node&&typeof node==='object'?(predicate(node)?node:find(node.props?.children,predicate)):undefined;
  assert.match(text(render()),/불러오는 중/);await flush();
  assert.equal(pending[0].days,7);assert.equal(pending[0].newOnly,true);
  const data={period_start:'2026-09-16T00:00:00+09:00',period_end:'2026-09-16T12:00:00+09:00',cohort_count:1,observed_users:0,stages:[],recent_users:[{user_id:'private-member-id',joined_at:'2026-09-16T00:00:00+09:00',last_event:null,last_at:null,events:[]}]};
  pending[0].resolve(data);await flush();let tree=render();
  assert.match(text(tree),/아직 수집된 기록 없음/);assert.doesNotMatch(text(tree),/미사용자/);
  find(tree,n=>n.type==='button'&&text(n)==='새로고침').props.onClick();render();await flush();
  authChanged('SIGNED_OUT');pending[1].resolve(data);await flush();
  tree=render();assert.doesNotMatch(text(tree),/private-/,'logout discards even an in-flight operator report');await flush();
  pending[2].reject(new Error('운영자만 확인할 수 있습니다'));await flush();tree=render();
  assert.match(text(tree),/운영자만 확인/);assert.doesNotMatch(text(tree),/단계별 인원/);
  cleanups.forEach(fn=>fn?.());assert.equal(unsubscribed,true);
}
(async()=>{
  for(const opts of [{mode:'development'},{enabled:'false'},{session:false}]){
    const h=setup(opts);assert.equal(h.api.trackProfileUsage('profile_opened'),undefined);await flush();assert.equal(h.calls.length,0);
  }
  const h=setup();h.api.useProfileUsageView('profile_opened');h.effects[0]();h.effects[0]();await flush();
  assert.equal(h.calls.length,1,'Strict Mode cannot double count a screen view');
  assert.equal(h.calls[0].args.p_event,'profile_opened');
  assert.deepEqual(Object.keys(h.calls[0].args).sort(),['p_error_code','p_event','p_id','p_platform','p_version'],'no user id, input, query string or raw error');
  assert.equal(h.calls[0].headers.Authorization,'Bearer account-A');
  h.api.trackProfileUsage('profile_saved');h.token('account-B');await flush();
  assert.equal(h.calls[1].headers.Authorization,'Bearer account-A','captured identity remains pinned during account changes');
  h.api.trackProfileUsage('shoe_opened');await flush();assert.equal(h.calls[2].headers.Authorization,'Bearer account-B');
  h.api.trackProfileUsage('profile_opened','person@example.com');h.api.trackProfileUsage('unknown_event');await flush();assert.equal(h.calls.length,3,'reject arbitrary data');
  assert.equal(h.api.profileUsageError(new Error('Failed to fetch person@example.com')),'network');
  const native=setup({platform:'ios'});native.api.trackProfileUsage('shoe_opened');native.api.trackProfileUsage('shoe_saved');await flush();
  assert.equal(native.calls.length,2);assert.equal(native.infoCalls(),1);assert.equal(native.calls[0].args.p_version,'1.1.1');
  const fallback=setup({platform:'android',nativeFails:true});fallback.api.trackProfileUsage('profile_opened');await flush();assert.equal(fallback.calls[0].args.p_version,null);
  const fail=setup({fail:true});for(let i=0;i<3;i++){fail.api.trackProfileUsage('profile_opened');await flush();}
  fail.api.trackProfileUsage('profile_saved');await flush();assert.equal(fail.calls.length,3,'failing endpoint pauses telemetry without retrying');
  const slow=setup({hang:true});assert.equal(slow.api.trackProfileUsage('profile_opened'),undefined);await flush();
  assert.equal(slow.calls.length,1);await new Promise(r=>setTimeout(r,45));assert.equal(slow.calls[0].signal.aborted,true,'hung transport is bounded');
  await checkAdminScreen();
  console.log('PASS profile usage client: unchanged synchronous actions, silent failures, bounded requests, no automatic retry, capture identity, Strict Mode dedupe, allowlists, native metadata and dev opt-out');
  console.log('PASS profile usage admin: loading, missing observations, permission errors, logout and stale response clearing');
})().catch(e=>{console.error(e);process.exitCode=1});
