import test from "node:test";
import assert from "node:assert/strict";
import { runTask } from "../src/runner.mjs";

  const task=()=>({id:"observer-smoke",prompt:"Read hello.txt and finish.",files:{"hello.txt":"hello"},deadlineMs:60000});
  test("throwing observers cannot change acceptance or see private checks",async()=>{
    const seen=[];
    const result=await runTask({task:task(),adapter:{id:"fake",kind:"fake",next:async()=>({action:{type:"finish",answer:"done"},usage:{}})},evaluate:async()=>({accepted:true,checks:["PRIVATE_AUDIT_MARKER"]}),onEvent(event){seen.push(event);throw new Error("observer failed");}});
    assert.equal(result.status,"finished");assert.equal(result.valid,true);assert.equal(result.accepted,true);assert.ok(seen.length>=3);
    assert.equal(result.observerErrors.length,seen.length);assert.ok(seen.every(Object.isFrozen));assert.equal(JSON.stringify(seen).includes("PRIVATE_AUDIT_MARKER"),false);
    assert.deepEqual(result.checks,["PRIVATE_AUDIT_MARKER"]);assert.ok(Object.isFrozen(result.observerErrors));
  });
  test("tool observations are live and deeply immutable",async()=>{
    let calls=0,observedRead=false,mutationRejected=false;
    const result=await runTask({task:task(),adapter:{id:"fake",kind:"fake",next:async({messages})=>{
      if(++calls===1)return{action:{type:"read_file",path:"hello.txt"},usage:{}};
      assert.equal(observedRead,true);assert.equal(JSON.parse(messages.at(-1).content).result.version,1);
      return{action:{type:"finish",answer:"done"},usage:{}};
    }},evaluate:async({snapshot})=>({accepted:snapshot["hello.txt"]==="hello",checks:[]}),onEvent(event){
      if(event.type==="model_response")mutationRejected=!Reflect.set(event.action,"type","replace_text");
      if(event.type==="tool_result"){observedRead=true;assert.ok(Object.isFrozen(event.reply.result));}
    }});
    assert.equal(result.accepted,true);assert.equal(mutationRejected,true);assert.equal(observedRead,true);assert.equal(result.observerErrors.length,0);
  });
  test("rejected observer promises are handled without altering acceptance",async()=>{
    const result=await runTask({task:task(),adapter:{id:"fake",kind:"fake",next:async()=>({action:{type:"finish",answer:"done"},usage:{}})},evaluate:async()=>({accepted:true,checks:[]}),onEvent:()=>Promise.reject(new Error("async observer failed"))});
    assert.equal(result.valid,true);assert.equal(result.accepted,true);assert.ok(result.observerErrors.some(e=>e.message==="async observer failed"));
  });
