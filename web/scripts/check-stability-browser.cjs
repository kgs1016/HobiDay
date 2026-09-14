const { chromium, expect } = require('@playwright/test');
// Run with an isolated @playwright/test installation; see docs/stability-recovery-2026-09-14.md.
const UID='b0000000-0000-4000-8000-000000000001',OTHER='b0000000-0000-4000-8000-000000000002',MATCH='b0000000-0000-4000-8000-000000000003';
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
 await context.addInitScript(({uid})=>{
  const token=btoa(JSON.stringify({alg:'none',typ:'JWT'}))+'.'+btoa(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600}))+'.signature';
  localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'test-refresh',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:uid,email:'test@example.test',aud:'authenticated',role:'authenticated'}}));
 },{uid:UID});
 let groupRelease,failGroup=true,failSend=true,failThumb=true,videoUploads=0,thumbUploads=0,sent=false;
 const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,HEAD,OPTIONS','access-control-expose-headers':'Location,Upload-Offset,Tus-Resumable,Upload-Length'};
 let fileSerial=0, interruptedChunks=0, resumedHeads=0;const transfers=new Map();
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname==='127.0.0.1'&&url.port==='3021')return route.continue();
  if(url.hostname!=='127.0.0.1'||url.port!=='54321')return route.fulfill({status:200,body:'',contentType:'text/css'});
  const reply=(data,status=200,headers={})=>route.fulfill({status,headers:{...cors,'content-type':'application/json',...headers},body:JSON.stringify(data)});
  if(request.method()==='OPTIONS')return reply({});
  if(url.pathname==='/storage/v1/upload/resumable'){
    const raw=request.headers()['upload-metadata']||'';
    const metadata=Object.fromEntries(raw.split(',').filter(Boolean).map(pair=>{const [k,v]=pair.trim().split(' ');return[k,Buffer.from(v||'','base64').toString()];}));
    const thumb=metadata.objectName.endsWith('.jpg');if(thumb)thumbUploads++;else videoUploads++;
    if(thumb&&failThumb)return reply({error:'test thumbnail failure'},403);
    const id=++fileSerial,offset=request.postDataBuffer()?.length||0;transfers.set(String(id),{offset,size:Number(request.headers()['upload-length']),thumb});return route.fulfill({status:201,headers:{...cors,location:`http://127.0.0.1:54321/storage/v1/upload/resumable/${id}`,'tus-resumable':'1.0.0','upload-offset':String(offset)},body:''});
  }
  if(url.pathname.startsWith('/storage/v1/upload/resumable/')){const item=transfers.get(url.pathname.split('/').at(-1));if(request.method()==='HEAD'){resumedHeads++;return route.fulfill({status:200,headers:{...cors,'tus-resumable':'1.0.0','upload-offset':String(item.offset),'upload-length':String(item.size)},body:''});}if(!item.thumb&&interruptedChunks===0){interruptedChunks++;return reply({error:'interrupted chunk'},503);}if(Number(request.headers()['upload-offset'])!==item.offset)throw Error('wrong resume offset');item.offset+=request.postDataBuffer()?.length||0;return route.fulfill({status:204,headers:{...cors,'tus-resumable':'1.0.0','upload-offset':String(item.offset)},body:''});}
  if(url.pathname.startsWith('/storage/'))return reply({error:'not found'},404);
  const name=url.pathname.split('/').at(-1);
  if(name==='my_chats')return reply([{match_id:MATCH,partner_id:OTHER,nickname:'복구 테스트',gender:'f',age:28,photo:null,home_gym:'테스트 장소',last_body:'테스트 메시지',last_at:new Date().toISOString(),unread:0}]);
  if(name==='my_session_chats'){
    if(failGroup){await new Promise(resolve=>groupRelease=resolve);return reply({message:'test unavailable'},503).catch(()=>{});}
    return reply([]);
  }
  if(name==='inbox_counts')return reply({requests:0,unread_messages:0});
  if(name==='chat_messages')return reply(sent?[{id:1,sender_id:UID,body:'보존할 메시지',created_at:new Date().toISOString(),mine:true}]:[]);
  if(name==='chat_send'){if(failSend)return reply({error:'test network failure'});sent=true;return reply({ok:true});}
  if(name==='chat_mark_read')return reply({ok:true});
  if(name==='profiles')return reply([{id:UID,nickname:'검증 사용자',gender:'f',career:2,is_public:true}]);
  if(name==='climbing_progress_v5')return reply({starting_shoe:{stage:'blue'},difficulty_counts:{},policy:'color-v2'});
  if(name==='post_detail')return reply(null);
  if(name==='video_post_create')return reply({id:MATCH});
  if(name==='token')return reply({message:'no token needed'},400);
  return reply([]);
 });
 await page.goto('http://127.0.0.1:3021/chat');
 await expect(page.getByRole('button',{name:/복구 테스트/})).toBeVisible({timeout:20000});
 await page.screenshot({path:'/private/tmp/hobiday-chat-independent.png'});
 groupRelease();
 await page.getByRole('button',{name:'모임 채팅',exact:true}).click();
 await expect(page.getByText('대화 목록을 불러오지 못했어요',{exact:true})).toBeVisible();
 await expect(page.getByText('아직 열린 모임 채팅이 없어요')).toHaveCount(0);
 await page.screenshot({path:'/private/tmp/hobiday-chat-error.png'});
 failGroup=false;await page.getByRole('button',{name:'다시 시도',exact:true}).click();
 await expect(page.getByText('아직 열린 모임 채팅이 없어요')).toBeVisible();
 await page.getByRole('button',{name:'1:1 채팅',exact:true}).click();
 await page.getByRole('button',{name:/복구 테스트/}).click();
 await page.getByPlaceholder('메시지 보내기').fill('보존할 메시지');
 await page.getByRole('button',{name:'전송',exact:true}).click();
 await expect(page.getByText('전송 결과를 확인하지 못했어요. 대화를 확인한 뒤 다시 시도해주세요',{exact:true})).toBeVisible();
 await expect(page.getByPlaceholder('메시지 보내기')).toHaveValue('보존할 메시지');
 await expect(page.getByRole('button',{name:'전송',exact:true})).toBeEnabled();
 await page.screenshot({path:'/private/tmp/hobiday-chat-send-failure.png'});
 failSend=false;await page.getByRole('button',{name:'전송',exact:true}).click();
 await expect(page.getByPlaceholder('메시지 보내기')).toHaveValue('');
 await page.goto('http://127.0.0.1:3021/videos/upload');
 await expect(page.locator('#video-body')).toBeEnabled({timeout:20000});
 const bytes=await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
  const ctx=canvas.getContext('2d'),stream=canvas.captureStream(10),chunks=[];
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
  recorder.ondataavailable=e=>chunks.push(e.data);
  const result=new Promise(resolve=>recorder.onstop=async()=>resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))));
  recorder.start();let n=0;const timer=setInterval(()=>{ctx.fillStyle=n++%2?'#60a5fa':'#15304c';ctx.fillRect(0,0,320,240);},50);
  await new Promise(r=>setTimeout(r,600));recorder.stop();clearInterval(timer);stream.getTracks().forEach(t=>t.stop());return result;
 });
 await page.locator('input[type=file]').first().setInputFiles({name:'sample.webm',mimeType:'video/webm',buffer:Buffer.concat([Buffer.from(bytes),Buffer.alloc(7*1024*1024)])});
 await page.locator('#video-body').fill('이어 올리기 검증');
 await expect(page.getByRole('button',{name:'올리기',exact:true})).toBeEnabled({timeout:25000});
 await page.getByRole('button',{name:'올리기',exact:true}).click();
 await expect(page.getByText('업로드가 중단됐어요. 다시 누르면 이어서 올려요',{exact:true})).toBeVisible({timeout:30000});
 await page.screenshot({path:'/private/tmp/hobiday-upload-failure.png'});
 if(videoUploads!==1)throw Error('unexpected video upload count '+videoUploads);
 await page.reload();
 await expect(page.locator('#video-body')).toHaveValue('이어 올리기 검증',{timeout:15000});
 await expect(page.locator('video')).toBeVisible();
 failThumb=false;
 await page.getByRole('button',{name:'다시 시도',exact:true}).click();
 await expect(page).toHaveURL(new RegExp('/videos/post\\?id='+MATCH),{timeout:30000});
 if(videoUploads!==1)throw Error('completed video uploaded again '+videoUploads);
 const draftPresent=await page.evaluate(async uid=>new Promise(resolve=>{const r=indexedDB.open('hobiday-video-drafts');r.onsuccess=()=>{const db=r.result,q=db.transaction('drafts').objectStore('drafts').get(uid+':info');q.onsuccess=()=>{resolve(!!q.result);db.close();};};}),UID);
 if(draftPresent)throw Error('published draft not cleared');
 if(!interruptedChunks||!resumedHeads)throw Error('chunk resume was not exercised');
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({passed:['independent chat lists','failed vs empty','retry recovery','failed send preserves input','successful retry clears input','thumbnail failure preserves video','draft restored after reload','only thumbnail retried','draft cleared after publish'],videoUploads,thumbUploads,interruptedChunks,resumedHeads},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
