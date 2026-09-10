const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const path=require('node:path');
const source=file=>fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
function load(file,imports={},globals={}){
 const exports={};vm.runInNewContext(ts.transpileModule(source(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,require:n=>{if(n in imports)return imports[n];throw Error(n)},...globals});return exports;
}
const complete=load('lib/profileGate.ts').isBasicProfileComplete;
const valid={nickname:'회원',gender:'f',age:27};
(async()=>{
 let profile=valid,user={id:'one'},remote=true,fail=false,destination;
 const alerts=[],storage=new Map();
 const p=load('lib/participation.ts',{'./supabase':{hasSupabase:()=>remote,currentUser:async()=>user,fetchMyProfileDb:async()=>{if(fail)throw Error('offline');return profile}},'./myProfile':{loadMyProfile:()=>profile},'./profileGate':{isBasicProfileComplete:complete}},
 {URL,alert:m=>alerts.push(m),window:{location:{pathname:'/session',search:'?id=123',hash:''}},sessionStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
 const router={push:url=>{destination=url}};
 for(const raw of ['https://evil.com','//evil.com','/\\evil.com','/login','/profile/new','/session/../profile/new'])assert.equal(p.safeParticipationReturn(raw),null);
 assert.equal(p.safeParticipationReturn('/session?id=123'),'/session?id=123');
 assert.equal(await p.requireParticipationProfile(router),true);assert.equal(alerts.length,0);
 profile={...valid,age:null};assert.equal(await p.requireParticipationProfile(router),false);
 assert.equal(alerts.at(-1),'프로필을 완성해주세요');assert.equal(destination,'/profile/new?returnTo=%2Fsession%3Fid%3D123');
 destination=null;fail=true;assert.equal(await p.requireParticipationProfile(router),false);assert.equal(destination,null);assert.ok(alerts.at(-1).includes('확인하지 못했어요'));
 fail=false;user=null;assert.equal(await p.requireParticipationProfile(router),false);assert.equal(destination,'/login');
 const controller=new AbortController();controller.abort();const count=alerts.length;
 await p.requireParticipationProfile(router,undefined,controller.signal);assert.equal(alerts.length,count);
 user={id:'one'};const a=await p.participationDraftKey('comment:1');user={id:'two'};const b=await p.participationDraftKey('comment:1');assert.notEqual(a,b);
 p.writeParticipationDraft(a,'작성 중');assert.equal(p.readParticipationDraft(a),'작성 중');assert.equal(p.readParticipationDraft(b),null);
 storage.set(a,JSON.stringify({value:'old',expires:0}));assert.equal(p.readParticipationDraft(a),null);
 p.writeParticipationDraft(a,'draft');p.writeParticipationDraft(a,'');assert.equal(p.readParticipationDraft(a),null);
 remote=false;profile=valid;assert.equal(await p.requireParticipationProfile(router),true);
 assert.equal(p.handleParticipationError('profile_incomplete',router,'//evil.com'),true);assert.equal(destination,'/profile/new?returnTo=%2F');
 console.log('PASS participation: minimum profile; optional photo; safe return; load failures; login; aborted checks; account-specific drafts, expiry and clearing; server rejection recovery.');
})().catch(e=>{console.error(e);process.exitCode=1});
