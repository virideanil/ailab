import test from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { runTask } from "../src/runner.mjs";

  const task=(extra={})=>({id:"runner-contract",prompt:"Replace alpha with beta.",files:{"a.txt":"alpha\n"},maxTurns:8,deadlineMs:1000,...extra});
  const fake=next=>({id:"test-fake",kind:"fake",next:async context=>({action:await next(context),usage:{}})});
  const finish=()=>({type:"finish",answer:"done"});
  const accept=()=>({accepted:true,checks:[]});
  function lastTool(messages){for(const m of [...messages].reverse()){try{const v=JSON.parse(m.content);if(typeof v.ok==="boolean")return v;}catch{}}assert.fail("No tool result");}
  function frozen(v){if(v&&typeof v==="object"){assert.ok(Object.isFrozen(v));for(const x of Object.values(v))frozen(x);}}
  test("finished artifacts are deeply immutable",async()=>{
    const r=await runTask({task:task(),adapter:fake(finish),evaluate:accept});
    assert.equal(r.status,"finished");assert.equal(r.valid,true);assert.equal(r.accepted,true);assert.equal(r.turns,1);assert.equal(r.adapterKind,"fake");frozen(r);
    assert.throws(()=>{r.snapshot["a.txt"]="bad";},TypeError);
  });
  test("stale CAS recovers without mutating and consumes turns",async()=>{
    let calls=0,version;
    const adapter=fake(({messages})=>{
      calls++;
      if(calls===1)return{type:"read_file",path:"a.txt"};
      if(calls===2){version=lastTool(messages).result.version;return{type:"replace_text",path:"a.txt",expectedVersion:version+1,oldText:"alpha",newText:"wrong"};}
      if(calls===3){assert.equal(lastTool(messages).ok,false);return{type:"read_file",path:"a.txt"};}
      if(calls===4){assert.equal(lastTool(messages).result.content,"alpha\n");return{type:"replace_text",path:"a.txt",expectedVersion:version,oldText:"alpha",newText:"beta"};}
      assert.equal(lastTool(messages).ok,true);return finish();
    });
    const r=await runTask({task:task({maxTurns:5}),adapter,evaluate:({snapshot})=>({accepted:snapshot["a.txt"]==="beta\n",checks:[]})});
    assert.equal(r.accepted,true);assert.equal(r.turns,5);
  });
  test("deadline fences an uncooperative late action",async()=>{
    let calls=0,release,signal,evaluations=0;
    const delayed=new Promise(resolve=>{release=resolve;});
    const r=await runTask({task:task({deadlineMs:50}),adapter:fake(ctx=>{
      signal=ctx.signal;return ++calls===1?{type:"read_file",path:"a.txt"}:delayed;
    }),evaluate:()=>{evaluations++;return accept();}});
    assert.equal(r.status,"deadline");assert.equal(r.valid,true);assert.equal(r.accepted,false);assert.equal(signal.aborted,true);
    const terminal=JSON.stringify(r);
    release({type:"replace_text",path:"a.txt",expectedVersion:1,oldText:"alpha",newText:"late"});
    await sleep(0);await sleep(0);
    assert.equal(calls,2);assert.equal(evaluations,0);assert.equal(JSON.stringify(r),terminal);assert.equal(r.snapshot["a.txt"],"alpha\n");
  });
  test("already aborted tasks never dispatch",async()=>{
    const controller=new AbortController();controller.abort();let calls=0;
    const r=await runTask({task:task(),signal:controller.signal,adapter:fake(()=>{calls++;return finish();}),evaluate:()=>{calls++;return accept();}});
    assert.equal(calls,0);assert.equal(r.status,"aborted");
  });
  test("maxTurns counts every dispatch",async()=>{
    let calls=0;
    const r=await runTask({task:task({maxTurns:2}),adapter:fake(()=>{calls++;return{type:"list_files"};}),evaluate:accept});
    assert.equal(calls,2);assert.equal(r.status,"max_turns");assert.equal(r.valid,true);assert.equal(r.accepted,false);
  });
  for(const action of [{type:"finish",answer:"done",extra:true},{type:"read_file"},{type:"unknown"}]){
    test("strict action rejection: "+JSON.stringify(action),async()=>{
      let evaluated=false;const r=await runTask({task:task(),adapter:fake(()=>action),evaluate:()=>{evaluated=true;return accept();}});
      assert.equal(r.status,"protocol_error");assert.equal(r.valid,true);assert.equal(evaluated,false);
    });
  }
  test("private grading stays isolated and outside product latency",async()=>{
    const secret="PRIVATE_ORACLE_7ecf48";
    const r=await runTask({task:task({deadlineMs:100}),adapter:fake(context=>{
      assert.deepEqual(Object.keys(context.task).sort(),["id","prompt"]);assert.equal(JSON.stringify(context).includes(secret),false);assert.equal("evaluate"in context,false);return finish();
    }),evaluate:async({snapshot})=>{frozen(snapshot);await sleep(130);return{accepted:true,checks:[secret]};}});
    assert.equal(r.accepted,true);assert.equal(r.status,"finished");assert.ok(r.elapsedMs<100);assert.ok(r.gradingElapsedMs>=100);
  });
  test("adapter error remains a measured product outcome",async()=>{
    const r=await runTask({task:task(),adapter:fake(async()=>{await sleep(30);throw new Error("Endpoint unavailable");}),evaluate:accept});
    assert.equal(r.status,"adapter_error");assert.equal(r.valid,true);assert.equal(r.accepted,false);assert.ok(r.elapsedMs>=20);
  });
  test("grader failure invalidates measurement",async()=>{
    const r=await runTask({task:task(),adapter:fake(finish),evaluate:()=>{throw new Error("Oracle crashed");}});
    assert.equal(r.valid,false);assert.equal(r.accepted,false);assert.equal(r.status,"evaluator_error");
  });
  test("grader timeout differs from submission timeout",{timeout:7000},async()=>{
    const r=await runTask({task:task({deadlineMs:100}),adapter:fake(finish),evaluate:()=>new Promise(()=>{})});
    assert.equal(r.valid,false);assert.equal(r.status,"evaluator_timeout");assert.ok(r.elapsedMs<100);
  });
