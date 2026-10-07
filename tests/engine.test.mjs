import test from "node:test";
import assert from "node:assert/strict";
import { runEngineTask } from "../src/engine.mjs";
import { createWorkspace } from "../src/workspace.mjs";
import { fixtures } from "../fixtures/smoke.mjs";
import { compileContract,finishContract } from "../src/task-contract.mjs";

const task={id:"independent",stratum:"coding",prompt:"Repair a.mjs",files:{"a.mjs":""},maxTurns:6,deadlineMs:1000,outputContract:{kind:"literal",value:"done"}};
function adapter(actions,seen=[]){let i=0;return {kind:"fake",async next(input){seen.push(input);return {action:actions[i++]};}};}
test("host fills versions and formats completion without exposing evaluator",async()=>{
  const seen=[];
  const out=await runEngineTask({task,adapter:adapter([
    {type:"write_file",path:"a.mjs",content:"x"},
    {type:"read_file",path:"a.mjs"},
    {type:"write_file",path:"a.mjs",content:"x"},
    {type:"finish",answer:"I fixed it."}],seen),
    evaluate:async(submission,{signal})=>{assert.equal(signal.aborted,false);return {accepted:submission.snapshot["a.mjs"]==="x"&&submission.answer==="done",checks:[]};}});
  assert.equal(out.accepted,true);assert.equal(out.edits,1);assert.equal(out.manifest["a.mjs"].version,2);
  assert.equal(out.rawAnswer,"I fixed it.");assert.equal(out.turns,4);
  assert.ok(out.events.some(e=>e.reply?.error?.message.includes("READ_REQUIRED")));
  assert.ok(seen.every(x=>Object.keys(x.task).sort().join(",")==="id,prompt"));
  assert.deepEqual(seen.map(x=>x.turn),[1,2,3,4]);
});
test("an unperformed edit cannot be completed by an answer",async()=>{
  const out=await runEngineTask({task:{...task,maxTurns:1},adapter:adapter([{type:"finish",answer:"done"}]),evaluate:()=>{throw Error("must not grade");}});
  assert.equal(out.accepted,false);assert.equal(out.status,"max_turns");
});
test("versioned context is observed and preparation is inside timer",async()=>{
  const out=await runEngineTask({task,contextReuse:true,adapter:adapter([{type:"write_file",path:"a.mjs",content:"ok"},{type:"finish",answer:"ok"}]),evaluate:()=>({accepted:true,checks:[]})});
  assert.equal(out.accepted,true);assert.equal(out.turns,2);
  assert.equal(out.events[0].type,"context_reuse");
});
test("atomic writes roll back all files on conflict or budget failure",()=>{
  const w=createWorkspace({a:"A",b:"B"},{maxTotalBytes:4});
  assert.throws(()=>w.applyChanges([{path:"a",expectedVersion:1,content:"AA"},{path:"b",expectedVersion:2,content:"BB"}]),/STALE_VERSION/);
  assert.deepEqual(w.snapshot(),{a:"A",b:"B"});
  assert.throws(()=>w.applyChanges([{path:"a",expectedVersion:1,content:"AAA"},{path:"b",expectedVersion:1,content:"BB"}]),/TOTAL_LIMIT/);
  assert.equal(w.read("a").version,1);
  w.applyChanges([{path:"a",expectedVersion:1,content:""},{path:"b",expectedVersion:1,content:"BBBB"}]);
  assert.equal(w.read("a").version,2);
});
test("all original smoke evaluators accept unchanged gold proposals under the new host",async()=>{
  for(const fixture of fixtures){
    const script=fixture.script.map(({expectedVersion,...action})=>action);
    const out=await runEngineTask({task:fixture.task,adapter:adapter(script),evaluate:fixture.evaluate});
    assert.equal(out.accepted,true,fixture.task.id+" "+JSON.stringify(out));
  }
});
test("structured evidence extraction generalizes paths and rejects conflicting or missing dates",()=>{
  const t={prompt:"Read different.txt and report the renewal date as YYYY-MM-DD. If it does not state a renewal date, answer exactly UNKNOWN.",files:{"different.txt":"Renewal date: 2027-02-11\nRenewal date: 2027-02-12\n"}};
  const w=createWorkspace(t.files),contract=compileContract(t),observed=new Map([["different.txt",1]]);
  assert.equal(finishContract(contract,{workspace:w,observed,answer:"2027-02-11",edits:0}),"UNKNOWN");
  assert.throws(()=>finishContract(contract,{workspace:w,observed:new Map(),answer:"x",edits:0}),/READ_REQUIRED/);
});
test("read-only evidence refuses mutations and keeps its initial data",async()=>{
  const t={id:"e",prompt:"Read facts.txt. Do not modify any files.",files:{"facts.txt":"unavailable"},maxTurns:3,deadlineMs:1000};
  const out=await runEngineTask({task:t,adapter:adapter([{type:"read_file",path:"facts.txt"},{type:"write_file",path:"facts.txt",content:"fiction"},{type:"finish",answer:"UNKNOWN"}]),evaluate:({snapshot,answer})=>({accepted:snapshot["facts.txt"]==="unavailable"&&answer==="UNKNOWN",checks:[]})});
  assert.equal(out.accepted,true);assert.equal(out.edits,0);
});

test("duplicate applied replacement is diagnosed without a second version change",async()=>{
 const out=await runEngineTask({task:{...task,files:{"a.mjs":"alpha"}},adapter:adapter([
  {type:"read_file",path:"a.mjs"},
  {type:"replace_text",path:"a.mjs",oldText:"alpha",newText:"beta"},
  {type:"replace_text",path:"a.mjs",oldText:"alpha",newText:"beta"},
  {type:"finish",answer:"done"}]),evaluate:({snapshot})=>({accepted:snapshot["a.mjs"]==="beta",checks:[]})});
 assert.equal(out.accepted,true);assert.equal(out.edits,1);assert.equal(out.manifest["a.mjs"].version,2);
 assert.ok(out.events.some(e=>e.reply?.error?.message.includes("ALREADY_APPLIED")));
});
test("same transformation remains usable after a distinct later revision",async()=>{
 const out=await runEngineTask({task:{...task,maxTurns:6,files:{"a.mjs":"alpha"}},adapter:adapter([
  {type:"read_file",path:"a.mjs"},
  {type:"replace_text",path:"a.mjs",oldText:"alpha",newText:"beta"},
  {type:"write_file",path:"a.mjs",content:"alpha!"},
  {type:"replace_text",path:"a.mjs",oldText:"alpha",newText:"beta"},
  {type:"finish",answer:"done"}]),evaluate:({snapshot})=>({accepted:snapshot["a.mjs"]==="beta!",checks:[]})});
 assert.equal(out.accepted,true);assert.equal(out.manifest["a.mjs"].version,4);
});

test("evidence questions cannot submit a guessed abstention before inspecting supplied documents",async()=>{
 const seen=[];
 const out=await runEngineTask({task:{id:"unknown-source",prompt:"Use only the files. Do not modify any files.",files:{"one.txt":"missing","two.txt":"missing"},maxTurns:4,deadlineMs:1000},adapter:adapter([
  {type:"finish",answer:"UNKNOWN"},{type:"read_file",path:"one.txt"},{type:"read_file",path:"two.txt"},{type:"finish",answer:"UNKNOWN"}],seen),evaluate:()=>({accepted:true,checks:[]})});
 assert.equal(out.accepted,true);assert.equal(out.turns,4);
 assert.ok(out.events.some(e=>e.reply?.error?.message.includes("READ_REQUIRED")));
 assert.equal(seen[1].messages.at(-1).role,"tool");
});
