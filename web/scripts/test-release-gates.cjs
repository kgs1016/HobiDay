/* Browser integration against `npm run dev -- --port 3195`.
 * PLAYWRIGHT_MODULE may point to an existing Playwright installation.
 * Native bridge + Supabase are simulated; no production writes or real login.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const env = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
const serviceUrl = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)[1].trim();
const baseUrl = process.env.GATE_TEST_URL || 'http://127.0.0.1:3195';
const tester = '11111111-1111-4111-8111-111111111111';
const expires = Math.floor(Date.now()/1000)+3600;
const session = {access_token:['e30',Buffer.from(JSON.stringify({sub:tester,role:'authenticated',exp:expires})).toString('base64url'),'test'].join('.'),refresh_token:'fake',expires_at:expires,expires_in:3600,token_type:'bearer',user:{id:tester,email:'tester@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{}}};
(async () => {
 const browser = await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'chrome'});
 try {
 for (const platform of ['android','ios']) {
  let maintenance=true, required=false, available=false, failPolicy=false, testerExempt=true;
  let protectedCalls=0, policyCalls=0;
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(({platform})=>{
   if(platform==='android')window.androidBridge={};
   else window.webkit={messageHandlers:{bridge:{}}};
   window.testNative={version:'1.1.3',opened:[],listeners:[],failStore:false};
   window.Capacitor={
    PluginHeaders:[
     {name:'App',methods:[{name:'getInfo',rtype:'promise'},{name:'getLaunchUrl',rtype:'promise'},{name:'addListener'},{name:'removeListener',rtype:'promise'}]},
     {name:'Browser',methods:[{name:'open',rtype:'promise'},{name:'close',rtype:'promise'}]},
     {name:'PushNotifications',methods:[{name:'checkPermissions',rtype:'promise'},{name:'addListener'},{name:'removeListener',rtype:'promise'}]},
    ],
    nativePromise:async(plugin,method,args)=>{
     if(method==='getInfo')return {version:window.testNative.version,build:'99',id:'kr.hobiday.app',name:'HobiDay'};
     if(method==='getLaunchUrl')return {};
     if(method==='checkPermissions')return {receive:'denied'};
     if(plugin==='Browser'&&method==='open'){
      if(window.testNative.failStore)throw new Error('store failed');
      window.testNative.opened.push(args.url);
     }
     return {};
    },
    nativeCallback:(plugin,method,args,callback)=>{
     if(method==='addListener')window.testNative.listeners.push({event:args.eventName,callback});
     return String(window.testNative.listeners.length);
    },
   };
  },{platform});
  await context.route(`${serviceUrl}/**`, async route=>{
   const url=new URL(route.request().url());
   const signedIn=route.request().headers().authorization===`Bearer ${session.access_token}`;
   const send=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(route.request().method()==='OPTIONS')return send({});
   if(url.pathname.endsWith('/rpc/app_update_policy')){
    policyCalls++;
    if(failPolicy)return send({message:'outage'},503);
    return send({ios_latest_version:available?'1.2.0':'1.1.3',android_latest_version:available?'1.2.0':'1.1.3',ios_minimum_version:required&&!(signedIn&&testerExempt)?'1.2.0':null,android_minimum_version:required&&!(signedIn&&testerExempt)?'1.2.0':null,title:'앱을 업데이트해 주세요',message:'더 나은 하비데이가 준비됐어요.'});
   }
   if(url.pathname.endsWith('/rpc/app_access_status'))return send({maintenance,allowed:!maintenance||(signedIn&&testerExempt),authenticated:signedIn,tester:signedIn&&testerExempt,title:'리뉴얼 준비 중',message:'조금만 기다려주세요.'});
   if(url.pathname==='/auth/v1/settings')return send({external:{email:true}});
   if(url.pathname==='/auth/v1/token')return send(session);
   if(url.pathname==='/auth/v1/user')return send(session.user);
   if(url.pathname==='/auth/v1/logout')return send({});
   // Push registration is an allowed infrastructure call, not service content.
   if(url.pathname.includes('push_token'))return send({});
   protectedCalls++;
   if(url.pathname.includes('inbox_counts'))return send({requests:0,unread_messages:0});
   return send([]);
  });
  const page=await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const heading=name=>page.getByRole('heading',{name,exact:true});
  const refresh=()=>page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.goto(baseUrl);
  await heading('리뉴얼 준비 중').waitFor();
  assert(policyCalls>0,'update check must run while maintenance hides app');
  assert.equal(protectedCalls,0);

  // Optional -> snooze -> mandatory must override snooze without reopening app.
  available=true; await refresh();
  await page.getByRole('button',{name:'나중에',exact:true}).click();
  await refresh();
  await page.waitForTimeout(500);
  assert.equal(await page.getByRole('dialog').count(),0);
  required=true; await refresh();
  await heading('앱을 업데이트해 주세요').waitFor();
  assert.equal(await page.getByRole('button',{name:'나중에',exact:true}).count(),0);
  assert.equal(await heading('리뉴얼 준비 중').count(),0,'mandatory update must take priority over maintenance');
  assert.equal(protectedCalls,0);
  await page.getByRole('button',{name:'업데이트',exact:true}).click();
  const urls=await page.evaluate(()=>window.testNative.opened);
  assert.match(urls[0],platform==='ios'?/apps.apple.com.*6803351277/:/play.google.com.*kr.hobiday.app/);
  await page.evaluate(()=>{window.testNative.failStore=true;});
  await page.getByRole('button',{name:'업데이트',exact:true}).click();
  await page.getByRole('link',{name:'스토어에서 직접 열기'}).waitFor();

  // Failed/invalid check must not dismiss an already confirmed requirement.
  failPolicy=true; await refresh(); await page.waitForTimeout(500);
  await heading('앱을 업데이트해 주세요').waitFor();
  failPolicy=false;
  await page.getByRole('link',{name:'문의하기',exact:true}).click();
  await heading('고객센터').waitFor();
  await page.goto(`${baseUrl}/community/post?id=secret`);
  await heading('앱을 업데이트해 주세요').waitFor();
  assert.equal(protectedCalls,0,'deep links must not mount service pages');

  // Login must remain possible; server's tester exception must refresh immediately.
  await page.getByRole('link',{name:'로그인',exact:true}).click();
  await page.getByLabel('이메일',{exact:true}).fill('tester@example.com');
  await page.getByLabel('비밀번호',{exact:true}).fill('fake-password');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await page.getByRole('navigation').waitFor({state:'visible',timeout:20000});
  assert.equal(await heading('앱을 업데이트해 주세요').count(),0);

  // Remove tester privilege, withdraw policy and reopen/pause without reinstall.
  testerExempt=false;
  required=false; available=false; maintenance=false;
  await page.goto(baseUrl);
  await page.getByRole('navigation').waitFor({state:'visible',timeout:20000});
  maintenance=true;
  // Use real foreground interval, not a manual refresh, to cover a user staying in app.
  await heading('리뉴얼 준비 중').waitFor({timeout:40000});
  assert.equal(await page.getByRole('navigation').count(),0);
  maintenance=false; await refresh();
  await page.getByRole('navigation').waitFor({state:'visible',timeout:20000});
  available=true; required=true; await refresh();
  await heading('앱을 업데이트해 주세요').waitFor();
  await page.evaluate(()=>{
   window.testNative.version='1.2.0';
   for(const listener of window.testNative.listeners)if(listener.event==='appStateChange')listener.callback({isActive:true});
  });
  await page.getByRole('navigation').waitFor({state:'visible',timeout:20000});
  assert.equal(await heading('앱을 업데이트해 주세요').count(),0);
  assert.deepEqual(errors,[]);
  await context.close();
  console.log(`PASS ${platform}: maintenance/update priority, snooze escalation, store links/failure, outage, deep links, tester login, 30s pause/reopen, installed-version refresh`);
 }
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
