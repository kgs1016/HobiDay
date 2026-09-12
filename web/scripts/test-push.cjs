const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, globals={}) {
 const api={}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:api,console:{warn(){}},...globals}); return api;
}
const flush=async()=>{for(let i=0;i<35;i++)await Promise.resolve();};
(async()=>{
 const server=load('../../supabase/functions/push/delivery.ts');
 assert.equal(server.fcmTokenIsDead({error:{status:'INVALID_ARGUMENT'}}),false);
 assert.equal(server.fcmTokenIsDead({error:{details:[{'@type':'type.googleapis.com/google.firebase.fcm.v1.FcmError',errorCode:'UNREGISTERED'}]}}),true);
 const row={id:'n',lease:'l',user_id:'u',title:'title',body:'body',url:'/chat',delivered_tokens:[]};
 const devices=[{token:'one',platform:'ios'},{token:'two',platform:'android'}];
 const first=await server.deliverPending(row,devices,async t=>t.token==='one');
 assert.equal(first.complete,false);assert.equal(first.sent,1);
 const called=[];
 const second=await server.deliverPending({...row,delivered_tokens:first.delivered},devices,async t=>{called.push(t.token);return true;});
 assert.deepEqual(called,['two']);assert.equal(second.complete,true);
 assert.equal((await server.deliverPending(row,[],async()=>false)).complete,true);
 assert.equal((await server.deliverPending(row,devices,async()=> 'dead')).complete,true);
 assert.equal((await server.deliverPending(row,devices,async()=>{throw Error('offline')})).complete,false);
 let attempts=0;assert.equal(await server.sendWithRetry(async()=>++attempts===3,async()=>{}),true);assert.equal(attempts,3);
 attempts=0;assert.equal(await server.sendWithRetry(async()=>{attempts++;return 'dead'},async()=>{}),'dead');assert.equal(attempts,1);
 assert.equal(server.safePushUrl('//evil.test'),'/');assert.equal(server.safePushUrl('/chat?id=x'),'/chat?id=x');

 // Exercise the real HTTP handler: CORS, auth, recipient restriction and failed DB reads.
 let handler, tokenLookupError=false; const rpcCalls=[];
 const admin={auth:{getUser:async()=>({data:{user:{id:'sender'}}})},rpc:async(name,args)=>{
   rpcCalls.push([name,args]);
   if(name==='can_notify')return{data:args.p_to==='recipient'};
   if(name==='notifications_push_claim')return{data:tokenLookupError?[row]:[]};
   return{data:true};
 },from:()=>({select:()=>({in:async()=>({data:null,error:tokenLookupError?{message:'offline'}:null})})})};
 load('../../supabase/functions/push/index.ts',{
  Deno:{serve:fn=>{handler=fn},env:{get:name=>({SUPABASE_SERVICE_ROLE_KEY:'test-service',APNS_KEY:'test-key',APNS_KEY_ID:'test-id',APPLE_TEAM_ID:'test-team'})[name]}},
  Response,Request,URLSearchParams,AbortSignal,
  require:name=>name==='./delivery.ts'?server:name.includes('supabase')?{createClient:()=>admin}:{},
 });
 let response=await handler(new Request('https://local.test',{method:'OPTIONS'}));
 assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),'*');
 response=await handler(new Request('https://local.test',{method:'POST',body:'null'}));assert.equal(response.status,400);
 response=await handler(new Request('https://local.test',{method:'POST',body:JSON.stringify({to:['recipient','forbidden'],title:'Title',queue_ids:['n']})}));
 assert.equal(response.status,200);
 assert.equal(JSON.stringify(rpcCalls.at(-1)),JSON.stringify(['notifications_push_claim',{p_limit:20,p_ids:['n'],p_users:['recipient']}]));
 tokenLookupError=true;
 response=await handler(new Request('https://local.test',{method:'POST',headers:{Authorization:'Bearer test-service'},body:'{}'}));
 assert.equal(response.status,503);
 assert.ok(!rpcCalls.some(x=>x[0]==='notifications_push_finish'),'failed token lookup never completes notifications');
 const listeners={},timers=new Map(),saved=[],store=new Map();let native=true,user=null,permission='granted',registrations=0,failSave=false,authCallback,resume,online;
 let timerId=0,requests=0;
 const invokes=[];const sb={functions:{invoke:async(name,args)=>{invokes.push(args.body);throw Error('offline')}},rpc:async(name)=>{saved.push(name);if(name==='notify_send_pending')return {data:['queued-id'],error:null};return failSave?{error:{message:'offline'},data:null}:{error:null,data:{ok:true}}},auth:{onAuthStateChange:fn=>{authCallback=fn;return {data:{subscription:{unsubscribe(){}}}}}}};
 const plugin={checkPermissions:async()=>({receive:permission}),requestPermissions:async()=>{requests++;return {receive:'granted'}},addListener:async(name,fn)=>{assert.ok(!listeners[name],'no duplicate registration listeners');listeners[name]=fn;return{remove:async()=>{delete listeners[name]}}},register:async()=>{registrations++;},unregister:async()=>{},createChannel:async()=>{}};
 const api=load('../src/lib/nativePush.ts',{
 require:name=>name==='@capacitor/core'?{Capacitor:{isNativePlatform:()=>native,getPlatform:()=> 'ios'}}:name==='@capacitor/push-notifications'?{PushNotifications:plugin}:name==='@capacitor/app'?{App:{addListener:async(name,fn)=>{resume=fn;return{remove:async()=>{}}}}}:{getSupabase:()=>sb,currentUser:async()=>user},
 setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:id=>timers.delete(id),
 localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
 window:{addEventListener:(name,fn)=>{online=fn},removeEventListener(){}}
 });
 const runTimers=async()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());await flush();};
 await api.registerPush();assert.equal(registrations,0,'signed-out phones are not registered');
 user={id:'u'};
 await Promise.all([api.registerPush(),api.registerPush()]);assert.equal(registrations,1);
 await listeners.registration({value:'device'});assert.equal(saved.at(-1),'push_token_save');
 failSave=true;await listeners.registration({value:'device'});assert.equal(timers.size,1,'failed token save retries');
 failSave=false;await runTimers();assert.equal(registrations,2);
 const stop=api.watchPushRegistration();await flush();const before=registrations;
 authCallback('SIGNED_IN');await runTimers();assert.equal(registrations,before+1,'email login registration');
 permission='denied';await api.registerPush();const denied=registrations;
 permission='granted';resume({isActive:true});await flush();assert.equal(registrations,denied+1,'Settings permission grant registers on resume');
 online();await flush();assert.equal(registrations,denied+2);
 assert.equal(requests,0,'already allowed permission never prompts again');
 const navigate=[];const stopTap=api.onPushTap(u=>navigate.push(u));await flush();
 listeners.pushNotificationActionPerformed({notification:{data:{url:'//evil.test'}}});
 listeners.pushNotificationActionPerformed({notification:{data:{url:'/session?id=1'}}});assert.deepEqual(navigate,['/session?id=1']);
 stopTap();stop();await api.unregisterPush();assert.equal(saved.at(-1),'push_token_delete');
 await api.notifyPush('recipient','Title','Body','/inbox');assert.equal(invokes[0].queue_ids[0],'queued-id','queue is retained when immediate delivery fails');
 await api.notifyPush('recipient','Title','Body','/inbox',{pushOnly:true,queuedOnServer:true});assert.equal(invokes.length,1,'server events are not sent twice');
 native=false;await api.registerPush();
 console.log('PASS push: email/resume registration, retries, listener deduplication, permission handling, safe taps, per-device delivery retry and token errors');
})().catch(e=>{console.error(e);process.exitCode=1});
