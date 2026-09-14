const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
// Characterization audit: asserts defects present at 51d4c2d; not a passing regression suite after fixes.
const ROOT=require('node:path').resolve(__dirname,'../../../web');
const ts=require(ROOT+'/node_modules/typescript');
const source=fs.readFileSync(ROOT+'/src/app/chat/page.tsx','utf8');
const sf=ts.createSourceFile('chat.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function variableWithin(component,name) {
  const fn=sf.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===component);
  let found;
  function scan(node){if(ts.isVariableDeclaration(node)&&node.name.getText(sf)===name)found=node.initializer;else ts.forEachChild(node,scan);}
  scan(fn.body);assert.ok(found,component+'.'+name);return found.getText(sf);
}
function compileExpression(expression,ctx) {
 const code=ts.transpileModule('globalThis.run = ('+expression+');',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(code,ctx);return ctx.run;
}
async function flush(){for(let i=0;i<10;i++)await Promise.resolve();}
(async()=>{
 const evidence=[];
 // Execute the real ChatContent load callback, with controlled RPC results.
 let chats=null,rooms=null,resolveGroup;
 const ctx={useCallback:f=>f,fetchChats:async()=>[{match_id:'demo'}],fetchSessionChats:()=>new Promise(r=>resolveGroup=r),setChats:x=>chats=x,setRooms:x=>rooms=x,signedPhotoUrls:async()=>({}),setPhotoUrls:()=>{}};
 const load=compileExpression(variableWithin('ChatContent','load'),ctx);
 const pending=load();await flush();assert.equal(chats,null);
 evidence.push('ChatContent: 1:1 목록 성공 후에도 모임 목록이 미응답이면 성공 목록을 화면에 반영하지 않음');
 resolveGroup(null);await pending;
 assert.ok(chats?.length);assert.equal(rooms,null);assert.equal(chats===null||rooms===null,true);
 evidence.push('ChatContent: 모임 목록 오류(null) 후 전체 loading 조건이 true로 남음');
 // Execute both real send handlers and the real shared form submit callback.
 for(const kind of ['Thread','SessionThread']){
  let input='실패하면 남아야 하는 메시지',busy=false,alertCount=0;
  const context={text:input,setText:x=>input=x,setBusy:x=>busy=x,chat:{match_id:'demo'},room:{session_id:'demo'},sendChat:async()=>({error:'network_error'}),sendSessionChat:async()=>({error:'network_error'}),alert:()=>alertCount++,notifyPush:()=>{},load:()=>{}};
  context.onSend=compileExpression(variableWithin(kind,'send'),context);
  const submit=compileExpression(variableWithin('ChatFrame','submit'),context);
  await submit({preventDefault(){}});assert.equal(input,'');assert.equal(busy,false);assert.equal(alertCount,1);
  evidence.push(kind+': 전송 실패 경고 뒤 입력 내용이 비워짐');
 }
 let busy=false,input='남길 내용';
 const context={text:input,setText:x=>input=x,setBusy:x=>busy=x,onSend:async()=>{throw Error('transport failed');}};
 const submit=compileExpression(variableWithin('ChatFrame','submit'),context);
 await assert.rejects(submit({preventDefault(){}}));assert.equal(busy,true);
 evidence.push('ChatFrame: onSend가 예외를 던지면 busy가 해제되지 않음');
 // Load the real polling module, then simulate a request that ignores abort.
 let timers=[],events={},calls=0,signal,resolve;
 const doc={visibilityState:'visible',addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n]};
 const pollingContext={exports:{},AbortController,document:doc,console,setTimeout:f=>(timers.push(f),timers.length),clearTimeout:()=>{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(ROOT+'/src/lib/polling.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,pollingContext);
 const poller=pollingContext.exports.startPolling(s=>{calls++;signal=s;return new Promise(r=>resolve=r);},15000);
 timers.shift()();await flush();doc.visibilityState='hidden';events.visibilitychange();assert.equal(signal.aborted,true);
 doc.visibilityState='visible';events.visibilitychange();await flush();assert.equal(calls,1);
 evidence.push('startPolling: abort를 따르지 않는 요청이 미응답이면 화면 복귀 후 새 요청이 시작되지 않음');
 poller.stop();resolve();await flush();
 console.log(JSON.stringify({reproduced:evidence.length,evidence,scope:'현재 소스의 실제 콜백을 추출하여 실행한 제어 실험. 실제 기기나 운영 장애 재현은 아님.'},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
