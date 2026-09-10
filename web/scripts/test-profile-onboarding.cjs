const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '../src');
const jsx = (type, props) => ({ type, props });
function load(file, imports = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), {compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,
  }}).outputText;
  vm.runInNewContext(code, {exports, ...globals, require: name => {
    if (Object.hasOwn(imports,name)) return imports[name];
    throw Error('unexpected import: '+name);
  }});
  return exports;
}
function find(node, match) {
  if (Array.isArray(node)) { for (const child of node) { const found=find(child,match); if(found)return found; } }
  if (!node || typeof node !== 'object') return;
  return match(node) ? node : find(node.props?.children,match);
}
const text = node => node == null ? '' : Array.isArray(node) ? node.map(text).join('') :
  typeof node === 'object' ? text(node.props?.children) : String(node);
const button = (tree,label) => find(tree,n=>n.type==='button' && text(n)===label);
function harness(file,imports,globals={}) {
  const slots=[]; const cleanups=[]; let index=0;
  const react={
    useState: initial => {const i=index++; if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;
      return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef: initial=>{const i=index++; return slots[i]??=( {current:initial} );},
    useEffect: (effect,deps) => {const i=index++; if(!slots[i] || deps.some((d,j)=>d!==slots[i][j])){
      cleanups[i]?.(); slots[i]=deps; cleanups[i]=effect();
    }},
  };
  const Component=load(file,{'react/jsx-runtime':{jsx,jsxs:jsx},react,...imports},globals).default;
  return {render:props=>{index=0;return Component(props);},unmount:()=>cleanups.forEach(fn=>fn?.())};
}
async function flush(){for(let i=0;i<15;i++)await Promise.resolve();}
const gate=load('lib/profileGate.ts');
const levels=load('lib/levels.ts');
const frequency=load('lib/visitFrequency.ts');
const hobi=load('lib/hobiDifficulty.ts', {'./gymGrades': {}});
const shoe=load('lib/shoeProgress.ts', {'./hobiDifficulty':hobi});
const valid={nickname:'가입 테스트',gender:'f',age:27,area:'',level:null,homeGym:'',mbti:'',photo:'fixture.webp',careerId:1,isPublic:false};

(async()=>{
  // Basic information must commit before navigation, including private profiles and partial legacy profiles.
  for(const onboarding of [true,false])for(const isPublic of [false,true])for(const failsFirst of [false,true]){
    let saved,settle,destination,calls=0;
    const alerts=[];
    const profile={...valid,isPublic,...(onboarding?{photo:undefined,gender:null,age:null}:{})};
    const router={push:url=>{destination=url;},replace:url=>{destination=url;}};
    const form=harness('app/profile/new/page.tsx',{
      'next/navigation':{useRouter:()=>router},
      '@/components/BackButton':{default:'back'},'@/lib/defaultAvatar':load('lib/defaultAvatar.ts'),
      '@/lib/queryId':{useQueryParam:()=>null},
      '@/lib/participation':{safeParticipationReturn:()=>null,PROFILE_REQUIRED_MESSAGE:'프로필을 완성해주세요'},
      '@/lib/levels':levels,'@/lib/visitFrequency':frequency,'@/lib/profileGate':gate,
      '@/lib/imageResize':{downscaleImage:async file=>file},
      '@/lib/myProfile':{loadMyProfile:()=>profile,saveMyProfile:p=>{saved=p;}},
      '@/lib/supabase':{hasSupabase:()=>true,currentUser:async()=>({id:'member'}),fetchMyProfileDb:async()=>profile,
        signedPhotoUrls:async()=>({}),uploadProfilePhoto:async()=>({path:'fixture.webp'}),PHOTO_MAX_BYTES:5000000,
        upsertMyProfileDb:async p=>{calls++;saved=p;return new Promise(resolve=>{settle=resolve;});}},
    },{alert:message=>{alerts.push(message);}});
    form.render(); await flush();
    if(onboarding){
      const genderField=find(form.render(),n=>n.props?.label==='성별');
      find(genderField,n=>text(n)==='여성' && typeof n.props?.onClick==='function').props.onClick();
      find(find(form.render(),n=>n.props?.label==='나이'),n=>n.type==='input').props.onChange({target:{value:'27'}});
      const input=find(form.render(),n=>n.type==='input'&&n.props.type==='file');
      input.props.onChange({target:{files:[{size:1000}],value:'photo'}});await flush();
    }
    const submit=()=>find(form.render(),n=>n.type==='form').props.onSubmit({preventDefault(){}});
    const pending=submit();await submit();
    assert.equal(calls,1,'double submit cannot duplicate profile writes');
    assert.equal(destination,undefined,'no navigation before a successful save');
    assert.equal(saved.isPublic,isPublic,'public opt-in survives the new flow');
    settle({error:failsFirst?'network':null});await pending;
    if(failsFirst){
      assert.equal(destination,undefined,'failed profile save stays on the first step');
      assert.equal(alerts.length,1);
      assert.equal(find(form.render(),n=>n.type==='button'&&n.props.type==='submit').props.disabled,false);
      const retry=submit();assert.equal(calls,2);settle({error:null});await retry;
    }else assert.equal(alerts.length,0);
    assert.equal(destination,onboarding?'/profile/shoe':isPublic?'/#people':'/me');
    assert.equal(saved.photo,'fixture.webp');
  }

  // Shoe entry checks: skip/save return to profile, existing choice cannot be selected again, load failure can retry.
  for(const scenario of ['ready','chosen','offline','logged-out','incomplete']){
    let destination;
    let result={can_set_start:true};
    if(scenario==='chosen')result={can_set_start:false,starting_shoe:{stage:'pink',expires_on:'2026-12-10'}};
    let offline=scenario==='offline';
    const router={replace:url=>{destination=url;}};
    const page=harness('app/profile/shoe/page.tsx',{
      'next/navigation':{useRouter:()=>router},'@/components/StartingShoePicker':{default:'picker'},
      '@/lib/climbingAscents':{isAscentPreview:()=>scenario==='incomplete',fetchClimbingProgress:async()=>{
        if(offline)throw Error('offline');return result;}},
      '@/lib/supabase':{hasSupabase:()=>scenario!=='incomplete',currentUser:async()=>scenario==='logged-out'?null:{id:'member'}},
      '@/lib/profileGate':gate,'@/lib/myProfile':{loadMyProfile:()=>({...valid,photo:undefined})},
    });
    page.render();await flush();let tree=page.render();
    if(scenario==='chosen')assert.equal(destination,'/me');
    if(scenario==='logged-out')assert.equal(destination,'/login');
    if(scenario==='incomplete')assert.equal(destination,undefined,'optional profile does not block shoe setup');
    if(scenario==='offline'){
      assert.equal(destination,undefined);assert.ok(find(tree,n=>n.props?.role==='alert'));
      button(tree,'다시 불러오기').props.onClick();offline=false;page.render();await flush();tree=page.render();
    }
    if(scenario==='ready'||scenario==='offline'){
      const picker=find(tree,n=>n.type==='picker');assert.ok(picker);
      picker.props.onSkip();assert.equal(destination,'/me');destination=undefined;
      picker.props.onSaved({total:0});assert.equal(destination,'/me');
    }
  }

  // Shared selector does not write on skip, blocks double saves and preserves selection for retry.
  let calls=0,resetCalls=0,skips=0,saved,settle;
  const picker=harness('components/StartingShoePicker.tsx',{
    'next/link':{default:'a'},'@/components/ClimbingShoe':{default:'shoe'},'@/lib/shoeProgress':shoe,
    '@/lib/climbingAscents':{setStartingShoe:async stage=>{calls++;assert.equal(stage,'purple');
      return new Promise((resolve,reject)=>{settle={resolve,reject};});},resetStartingShoe:async stage=>{resetCalls++;assert.equal(stage,'blue');
      return {total:0,difficulty_counts:{},starting_shoe:{stage:'blue',expires_on:'2026-12-10'},can_reset_start:false};}},
  });
  const props={onboarding:true,onSkip:()=>{skips++;},onSaved:p=>{saved=p;}};
  let tree=picker.render(props);
  assert.equal(button(tree,'색을 선택해주세요').props.disabled,true);
  button(tree,'나중에 설정').props.onClick();assert.equal(skips,1);assert.equal(calls,0);
  find(tree,n=>n.props?.['aria-label']==='보라').props.onClick();tree=picker.render(props);
  assert.ok(text(tree).includes('H8 이상 25개 · 1,300점'));
  const save=button(tree,'이 색으로 시작하기').props.onClick;
  const pending=save();await save();assert.equal(calls,1);
  tree=picker.render(props);assert.equal(button(tree,'나중에 설정').props.disabled,true);
  settle.reject(Error('network'));await pending;tree=picker.render(props);
  assert.equal(saved,undefined);assert.ok(find(tree,n=>n.props?.role==='alert'));
  assert.equal(find(tree,n=>n.props?.['aria-label']==='보라').props['aria-pressed'],true);
  const retry=button(tree,'이 색으로 시작하기').props.onClick();
  settle.resolve({total:0,difficulty_counts:{}});await retry;
  assert.equal(saved.total,0);assert.equal(calls,2);
  const resetPicker=harness('components/StartingShoePicker.tsx',{
    'next/link':{default:'a'},'@/components/ClimbingShoe':{default:'shoe'},'@/lib/shoeProgress':shoe,
    '@/lib/climbingAscents':{setStartingShoe:async()=>{throw Error('wrong action');},resetStartingShoe:async stage=>{resetCalls++;assert.equal(stage,'blue');
      return {total:0,difficulty_counts:{},starting_shoe:{stage:'blue',expires_on:'2026-12-10'},can_reset_start:false};}},
  });
  const resetProps={...props,reset:true};tree=resetPicker.render(resetProps);
  find(tree,n=>n.props?.['aria-label']==='파랑').props.onClick();tree=resetPicker.render(resetProps);
  await button(tree,'이 색으로 다시 시작하기').props.onClick();
  assert.equal(resetCalls,1);
  console.log('PASS: committed basic profile → shoe step; edit routes; authentication, repeat setup/reset and retry; skip without writes; duplicate saves');
})().catch(error=>{console.error(error);process.exitCode=1;});
