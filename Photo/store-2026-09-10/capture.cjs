// Captures the actual app components in the isolated, local fixture build.
// Never connect this capture build to production Supabase.
const {chromium}=require('playwright');
const fs=require('node:fs/promises'); const path=require('node:path');
const root=__dirname;
const scenes=[
 ['01-home','/','모임 찾기'],['02-search','/?store=search','장소 검색'],['03-session','/session?id=s1','모임 정보'],['04-people','/#people','사람 찾기'],['05-chat','/chat?thread=store-chat','대화'],['06-board','/community','게시판'],['07-news','/community?tab=news','뉴스'],['08-videos','/videos','영상'],['09-records','/me/ascents','완등 기록'],['10-shoe','/me','암벽화'],
];
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:428,height:830},deviceScaleFactor:3,locale:'ko-KR',timezoneId:'Asia/Seoul',colorScheme:'light',reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [name,route] of scenes.slice(Number(process.argv[2]||1)-1,process.argv[3]?Number(process.argv[3]):undefined)){
   await page.goto('http://127.0.0.1:3010'+route,{waitUntil:'networkidle'});
   if(name==='05-chat') await page.getByText('좋아요! 토요일에 봬요 😊',{exact:false}).waitFor(); else if(name==='09-records')await page.getByLabel('클라이밍장 브랜드',{exact:true}).waitFor();else await page.locator('main').waitFor();
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(im=>im.decode().catch(()=>{})));});
   const content=await page.locator(name==='05-chat'?'body':'main').innerText();
   if(/프로필이 아직|불러오지 못|불러오는 중|로그인하면|기본 정보를 입력/.test(content))throw Error(name+': '+content);
   await page.screenshot({path:path.join(root,'screens',name+'.png'),fullPage:false});
   console.log(name,content.replaceAll('\n',' ').slice(0,110));
  }
  if(errors.length)throw Error(errors.join('\n'));
 }finally{await browser.close();}
})();
