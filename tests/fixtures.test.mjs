import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace } from "../src/workspace.mjs";
import { fixtures } from "../fixtures/smoke.mjs";

  function gold(f){
    const w=createWorkspace(structuredClone(f.task.files));let answer;
    for(const a of f.script){
      if(a.type==="read_file")w.read(a.path);
      else if(a.type==="replace_text"){const{type,...edit}=a;w.replaceText(edit);}
      else if(a.type==="finish")answer=a.answer;
      else assert.fail(a.type);
    }
    return{snapshot:w.snapshot(),answer};
  }
  test("eight smoke fixtures have task-only public envelopes",()=>{
    assert.equal(fixtures.length,8);assert.equal(new Set(fixtures.map(f=>f.task.id)).size,8);
    for(const f of fixtures){
      assert.deepEqual(Object.keys(f.task).sort(),["deadlineMs","files","id","maxTurns","prompt"]);
      assert.ok(f.script.length<=f.task.maxTurns);assert.equal(f.task.deadlineMs,120000);
    }
  });
  for(const f of fixtures){
    test(`${f.task.id}: gold accepted, wrong answer and extra file rejected`,()=>{
      const result=gold(f);assert.equal(f.evaluate(result).accepted,true);
      assert.equal(f.evaluate({...result,answer:"WRONG"}).accepted,false);
      assert.equal(f.evaluate({...result,snapshot:{...result.snapshot,"unexpected.txt":"bad"}}).accepted,false);
    });
    if(f.script.some(a=>a.type==="replace_text"))test(`${f.task.id}: missing edit rejected`,()=>{
      assert.equal(f.evaluate({snapshot:f.task.files,answer:"done"}).accepted,false);
    });
  }
