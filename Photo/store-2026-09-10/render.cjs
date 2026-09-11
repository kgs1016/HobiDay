// Render the editable typography/layout at each store's exact pixel dimensions.
const {chromium}=require('playwright'); const fs=require('node:fs/promises');const path=require('node:path');const {pathToFileURL}=require('node:url');
const root=__dirname;const names=['home','search','session','people','chat','board','news','videos','records','shoe'];
(async()=>{const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});try{
 const page=await browser.newPage({deviceScaleFactor:1});
 for(const format of ['appstore','playstore']){
  const width=format==='appstore'?1284:1080,height=format==='appstore'?2778:1920;
  await fs.mkdir(path.join(root,`${format}-${width}x${height}`),{recursive:true});
  await page.setViewportSize({width,height});
  for(let i=0;i<10;i++){
   await page.goto(pathToFileURL(path.join(root,'artwork.html')).href+`?n=${i+1}${format==='playstore'?'&format=play':''}`,{waitUntil:'networkidle'});
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
   const errors=await page.evaluate(()=>{const a=document.querySelector('.art').getBoundingClientRect();const im=document.querySelector('.device').getBoundingClientRect();const h=document.querySelector('h1');return {deviceBottom:im.bottom,artBottom:a.bottom,textOverflow:h.scrollWidth>h.clientWidth};});
   if(errors.deviceBottom>height||errors.textOverflow)throw Error(JSON.stringify({format,i,...errors}));
   const filename=`${String(i+1).padStart(2,'0')}-${names[i]}.png`;
   await page.screenshot({path:path.join(root,`${format}-${width}x${height}`,filename)});
   console.log(format,filename);
  }
 }
}finally{await browser.close();}})();
