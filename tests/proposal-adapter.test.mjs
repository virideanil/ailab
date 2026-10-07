import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createProposalAdapter } from "../src/proposal-adapter.mjs";
test("task-local cache policy, schema and Qwen3 template settings reach the real HTTP boundary",async()=>{
 const requests=[];
 const server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk;requests.push(JSON.parse(body));
  res.setHeader("content-type","application/json");
  res.end(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify({type:"finish",answer:"UNKNOWN"})}}],usage:{prompt_tokens:12,completion_tokens:5,total_tokens:17,prompt_tokens_details:{cached_tokens:4}},timings:{cache_n:4,prompt_n:8,predicted_n:5,draft_n:7,draft_n_accepted:3}}));
 });
 await new Promise(r=>server.listen(0,"127.0.0.1",r));
 try{
  const adapter=createProposalAdapter({baseUrl:"http://127.0.0.1:"+server.address().port,sampling:{chat_template_kwargs:{enable_thinking:false}}});
  let result;
  for(const turn of [1,2,1])result=await adapter.next({messages:[{role:"user",content:"task"}],turn});
  assert.deepEqual(requests.map(r=>r.cache_prompt),[false,true,false]);
  assert.equal(requests[0].chat_template_kwargs.enable_thinking,false);
  const schemas=requests[0].response_format.json_schema.schema.oneOf;
  assert.equal(schemas.some(x=>x.properties.type.enum[0]==="rename_identifier"),false);
  const replace=schemas.find(x=>x.properties.type.enum[0]==="replace_text");
  assert.equal(replace.properties.oldText.minLength,1);
  assert.equal(Object.hasOwn(replace.properties,"expectedVersion"),false);
  assert.equal(result.usage.cached_tokens,4);assert.equal(result.usage.draft_n_accepted,3);
 }finally{await new Promise(r=>server.close(r));}
});
