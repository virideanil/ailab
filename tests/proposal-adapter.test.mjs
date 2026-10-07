import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createProposalAdapter } from "../src/proposal-adapter.mjs";
import { runEngineTask } from "../src/engine.mjs";
const completion=(name,args,id="call_a")=>({choices:[{finish_reason:"tool_calls",message:{tool_calls:[{id,type:"function",function:{name,arguments:JSON.stringify(args)}}]}}],usage:{prompt_tokens:12,completion_tokens:5,total_tokens:17,prompt_tokens_details:{cached_tokens:4}},timings:{cache_n:4,prompt_n:8,predicted_n:5,draft_n:7,draft_n_accepted:3}});
async function serve(handler,run){
 const server=createServer(async(req,res)=>{let body="";for await(const chunk of req)body+=chunk;res.setHeader("content-type","application/json");res.end(JSON.stringify(handler(JSON.parse(body))));});
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 try{await run("http://127.0.0.1:"+server.address().port);}finally{await new Promise(r=>server.close(r));}
}
test("native tools preserve trained transcript, task-local cache and host-owned versions at HTTP boundary",async()=>{
 const requests=[],responses=[completion("read_file",{path:"a.mjs"},"read"),completion("write_file",{path:"a.mjs",content:"fixed"},"edit"),completion("finish",{answer:"done"},"finish")];
 await serve(req=>{requests.push(req);return responses[requests.length-1];},async baseUrl=>{
  const out=await runEngineTask({task:{id:"independent",prompt:"Repair a.mjs. Finish with exactly: done.",files:{"a.mjs":"broken"},maxTurns:3,deadlineMs:3000},adapter:createProposalAdapter({baseUrl,sampling:{chat_template_kwargs:{enable_thinking:false}}}),evaluate:({snapshot})=>({accepted:snapshot["a.mjs"]==="fixed",checks:[]})});
  assert.equal(out.accepted,true);
  assert.deepEqual(requests.map(r=>r.cache_prompt),[false,true,true]);
  assert.equal(requests[0].chat_template_kwargs.enable_thinking,false);
  assert.equal(requests[0].tool_choice,"auto");assert.equal(requests[0].parallel_tool_calls,false);
  assert.equal(Object.hasOwn(requests[0],"response_format"),false);
  assert.deepEqual(requests[0].tools,requests[2].tools);
  assert.equal(requests[2].messages.filter(m=>m.role==="user").length,1);
  assert.deepEqual(requests[2].messages.map(m=>m.role),["system","user","assistant","tool","assistant","tool"]);
  assert.equal(requests[1].messages[2].tool_calls[0].id,"read");assert.equal(requests[1].messages[3].tool_call_id,"read");
  const receipt=JSON.parse(requests[2].messages[5].content).receipt;
  assert.deepEqual(receipt.changes,[{path:"a.mjs",beforeVersion:1,version:2}]);assert.equal(receipt.operationId,"edit");
  const defs=requests[0].tools.map(t=>t.function);
  assert.equal(defs.some(t=>t.name==="rename_identifier"),false);
  const replace=defs.find(t=>t.name==="replace_text").parameters;
  assert.equal(replace.properties.oldText.minLength,1);assert.equal(Object.hasOwn(replace.properties,"expectedVersion"),false);
  assert.equal(out.usage.cached_tokens,12);assert.equal(out.usage.draft_n_accepted,9);
 });
});
test("malformed, extra, parallel and truncated tool calls cannot become actions",async()=>{
 const bad=[];
 for(const args of ["null","[]",'{"answer":"ok","type":"write_file"}','{"answer":"ok","expectedVersion":1}','{"answer":"ok","__proto__":{}}','{"answer":3}','{"answer":"ok"} trailing']){
  const p=completion("finish",{});p.choices[0].message.tool_calls[0].function.arguments=args;bad.push(p);
 }
 const parallel=completion("finish",{answer:"ok"});parallel.choices[0].message.tool_calls.push(parallel.choices[0].message.tool_calls[0]);bad.push(parallel);
 const length=completion("finish",{answer:"ok"});length.choices[0].finish_reason="length";bad.push(length);
 bad.push({choices:[{finish_reason:"stop",message:{content:'{"type":"finish","answer":"ok"}'}}]});
 bad.push(completion("rename_identifier",{path:"a",oldName:"a",newName:"b"}));
 let i=0;
 await serve(()=>bad[i++],async baseUrl=>{
  const adapter=createProposalAdapter({baseUrl});
  for(let n=0;n<bad.length;n++)await assert.rejects(()=>adapter.next({messages:[{role:"user",content:"task"}]}));
 });
});
