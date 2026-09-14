const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {indexedDB}=require('fake-indexeddb');
const ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/lib/videoDraft.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const api={};vm.runInNewContext(code,{exports:api,indexedDB,setTimeout,clearTimeout});
(async()=>{
 const file=new Blob(['video-bytes'],{type:'video/mp4'}),thumbnail=new Blob(['thumb'],{type:'image/jpeg'});
 await api.saveVideoDraft('alice',{body:'첫 초안'},{file,thumbnail});
 const plan={id:'draft',video:'alice/draft/video.mp4',thumbnail:'alice/draft/thumbnail.jpg',videoUploaded:true};
 await api.saveVideoDraft('alice',{plan});
 await api.saveVideoDraft('alice',{body:'고친 초안'});
 let d=await api.readVideoDraft('alice');assert.equal(d.body,'고친 초안');assert.equal(d.plan.videoUploaded,true);assert.equal(await d.file.text(),'video-bytes');
 assert.equal(await api.readVideoDraft('bob'),null);
 await api.clearVideoDraft('alice');assert.equal(await api.readVideoDraft('alice'),null);
 console.log('PASS IndexedDB: media restore, independent metadata updates, account isolation and clear');
})().catch(e=>{console.error(e);process.exitCode=1;});
