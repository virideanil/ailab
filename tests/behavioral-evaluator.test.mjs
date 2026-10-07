import test from "node:test";
import assert from "node:assert/strict";
import {
 BehavioralInfrastructureError,createBehavioralEvaluator,evaluateAnswer,jsonEqual,jsonText,
 validateBehavioralSpec,validateSnapshot,verifyBehavioralFixtures
} from "../src/behavioral-evaluator.mjs";
const baseSpec=()=>({kind:"javascript",entry:"src/task.mjs",exportName:"solve",cases:[{args:[2,3],expected:5}]});
const submission=source=>({snapshot:{"src/task.mjs":source},answer:"done"});
test("JSON equality preserves types, order and special own keys",()=>{
 assert.equal(jsonEqual({a:1,b:[null,false]},{b:[null,false],a:1}),true);
 assert.equal(jsonEqual([1,2],[2,1]),false);assert.equal(jsonEqual({a:1},{a:"1"}),false);
 const value=JSON.parse('{"__proto__":{"polluted":true},"constructor":"own","prototype":0}');
 assert.equal(jsonEqual(value,JSON.parse(jsonText(value))),true);
 assert.equal(jsonEqual(value,{constructor:"own",prototype:0}),false);
 assert.equal(Object.prototype.polluted,undefined);
 const shared={n:1};assert.equal(jsonText([shared,shared]),'[{"n":1},{"n":1}]');assert.equal(jsonEqual(-0,0),true);
});
test("JSON contract rejects cycles, undefined, accessors and non-JSON values",()=>{
 const cycle={};cycle.self=cycle;let invoked=false;
 const getter=Object.defineProperty({},"x",{enumerable:true,get(){invoked=true;return 1;}});
 for(const value of [cycle,getter,{[Symbol("x")]:1},Object.defineProperty({},"x",{value:1}),new Array(1),undefined,NaN,Infinity,1n,()=>1,{x:undefined},new Date(),new Map()])assert.throws(()=>jsonText(value),TypeError);
 assert.equal(invoked,false);assert.throws(()=>jsonText("x".repeat(1048577)),/limit/);
});
test("snapshot validation rejects traversal, collisions and oversize files",()=>{
 for(const path of ["../x","/tmp/x","a/../x","./x","a//x","a/","C:/x","a\\b","a\0b"])assert.throws(()=>validateSnapshot({[path]:"x"}),TypeError);
 assert.throws(()=>validateSnapshot({a:"","a/b.mjs":""}),/collision/);
 assert.throws(()=>validateSnapshot({"a.mjs":"x".repeat(65537)}),/limit/);
 let invoked=false;assert.throws(()=>validateSnapshot(Object.defineProperty({},"x",{enumerable:true,get(){invoked=true;return "";}})),TypeError);
 assert.equal(invoked,false);assert.equal(Object.hasOwn(validateSnapshot(Object.fromEntries([["__proto__","text"]])),"__proto__"),true);
});
test("private specs clone JSON without mutating callers and reject leaked fields",()=>{
 const source=baseSpec(),before=JSON.stringify(source),clean=validateBehavioralSpec(source);clean.cases[0].args[0]=99;
 assert.equal(JSON.stringify(source),before);
 for(const invalid of [{...baseSpec(),cases:[]},{...baseSpec(),cases:new Array(1)},{...baseSpec(),imports:["../secret.mjs"]},{...baseSpec(),imports:new Array(1)},{...baseSpec(),forbiddenExports:[42]},{...baseSpec(),referenceFiles:{}},{...baseSpec(),cases:[{args:[],expected:undefined}]}])assert.throws(()=>validateBehavioralSpec(invalid),TypeError);
});
test("answer grading supports text, JSON and unchanged public files",()=>{
 const spec={kind:"answer",format:"text",expected:"UNKNOWN",unchangedFiles:{"notes.txt":"no date"}};
 assert.equal(evaluateAnswer({snapshot:{"notes.txt":"no date"},answer:" UNKNOWN\n"},spec).accepted,true);
 assert.equal(evaluateAnswer({snapshot:{"notes.txt":"changed"},answer:"UNKNOWN"},spec).accepted,false);
 assert.equal(evaluateAnswer({snapshot:{},answer:"UNKNOWN"},spec).accepted,false);
 const expected=JSON.parse('{"__proto__":{"x":1},"a":[1,2]}');
 assert.equal(evaluateAnswer({snapshot:{},answer:'{"a":[1,2],"__proto__":{"x":1}}'},{kind:"answer",format:"json",expected}).accepted,true);
 assert.equal(evaluateAnswer({snapshot:{},answer:"{broken"},{kind:"answer",format:"json",expected}).accepted,false);
});
test("private evaluator executes actual candidate snapshots inside Docker",{
 skip:process.env.RUN_DOCKER_EVALUATOR_TESTS!=="1",timeout:180000
},async t=>{
 const evaluate=await createBehavioralEvaluator({image:process.env.EVALUATOR_IMAGE??"node:24-bookworm-slim",executionTimeoutMs:4000});
 assert.match(evaluate.provenance.imageId,/^sha256:[a-f0-9]{64}$/);assert.equal(evaluate.provenance.network,"none");assert.equal(Object.isFrozen(evaluate.provenance),true);
 await t.test("JSON and UTF-8 round-trip through actual code",async()=>{
  const data=JSON.parse('{"__proto__":{"safe":true},"constructor":"own","nested":[null,false,2]}');
  const cases=[data,"🙂漢字".repeat(4096),[1,{a:[false]}]].map(value=>({args:[value],expected:value}));
  const result=await evaluate(submission('export function solve(value){console.log("candidate log");return value;}'),{...baseSpec(),cases});
  assert.equal(result.accepted,true,JSON.stringify(result));assert.equal(Object.prototype.safe,undefined);
 });
 await t.test("whole submitted module graph matters",async()=>{
  const task='import {add} from "./helper.mjs";export const solve=(a,b)=>add(a,b);';
  const good={"src/task.mjs":task,"src/helper.mjs":"export const add=(a,b)=>a+b;"},bad={...good,"src/helper.mjs":"export const add=(a,b)=>a-b;"};
  assert.equal((await evaluate({snapshot:good},baseSpec())).accepted,true);
  assert.equal((await evaluate({snapshot:bad},baseSpec())).accepted,false);
  assert.equal((await evaluate({snapshot:good},{...baseSpec(),cases:[{args:[2,3],expected:99}]})).accepted,false);
 });
 await t.test("fixture admission verifies references and broken starters",async()=>{
  const bad={"src/task.mjs":"export const solve=(a,b)=>a-b;"},good={"src/task.mjs":"export const solve=(a,b)=>a+b;"};
  const fixture={task:{id:"oracle-test",files:bad},evaluateSpec:baseSpec(),referenceFiles:good};
  assert.equal((await verifyBehavioralFixtures(evaluate,[fixture])).verified,true);
  await assert.rejects(()=>verifyBehavioralFixtures(evaluate,[{...fixture,referenceFiles:bad}]),BehavioralInfrastructureError);
  await assert.rejects(()=>verifyBehavioralFixtures(evaluate,[{...fixture,task:{...fixture.task,files:good}}]),BehavioralInfrastructureError);
 });
 await t.test("rename grading checks updated callers and removed old API",async()=>{
  const spec={...baseSpec(),entry:"src/helper.mjs",exportName:"sum",imports:["src/task.mjs","src/report.mjs"],forbiddenExports:["add"]};
  const good={"src/helper.mjs":"export const sum=(a,b)=>a+b;","src/task.mjs":'import {sum} from "./helper.mjs";export const solve=sum;',"src/report.mjs":'import {sum} from "./helper.mjs";export const report=()=>sum(1,2);'};
  assert.equal((await evaluate({snapshot:good},spec)).accepted,true);
  const alias=await evaluate({snapshot:{...good,"src/helper.mjs":good["src/helper.mjs"]+"export const add=sum;"}},spec);
  assert.equal(alias.accepted,false);assert.equal(alias.checks.find(c=>c.name==="removed exports").passed,false);
  assert.equal((await evaluate({snapshot:{...good,"src/task.mjs":'import {add} from "./helper.mjs";export const solve=add;'}},spec)).accepted,false);
 });
 await t.test("undefined cyclic throwing and invalid candidates fail",async()=>{
  for(const source of ["export function solve(){}","export function solve(){const x={};x.x=x;return x;}","export function solve(){throw new Error('bad');}","export function solve( {"])assert.equal((await evaluate(submission(source),baseSpec())).accepted,false);
 });
 await t.test("actual container cannot write protected mounts or access an external interface",async()=>{
  const code=['import {writeFileSync} from "node:fs";','import {networkInterfaces} from "node:os";','export function solve(){const writable=[];for(const p of ["/candidate/new.txt","/worker.mjs","/etc/grade-test"]){try{writeFileSync(p,"x");writable.push(p);}catch{}}return {uid:process.getuid(),writable,external:Object.values(networkInterfaces()).flat().filter(x=>!x.internal).length};}'].join("\n");
  const result=await evaluate(submission(code),{...baseSpec(),cases:[{args:[],expected:{uid:65534,writable:[],external:0}}]});
  assert.equal(result.accepted,true,JSON.stringify(result));
 });
 await t.test("expected answers remain outside the candidate container",async()=>{
  const code='import {readFileSync,readdirSync} from "node:fs";export function solve(){return {secret:readFileSync("/worker.mjs","utf8").includes("PRIVATE_EXPECTATION_94726"),files:readdirSync("/candidate").sort()};}';
  assert.equal((await evaluate(submission(code),{...baseSpec(),cases:[{args:[],expected:{secret:false,files:["src"]}}]})).accepted,true);
  assert.equal((await evaluate(submission(code),{...baseSpec(),cases:[{args:[],expected:"PRIVATE_EXPECTATION_94726"}]})).accepted,false);
 });
 await t.test("infinite loops are rejected and containers cleaned up",async()=>{
  const start=Date.now(),result=await evaluate(submission("export function solve(){while(true){}}"),baseSpec());
  assert.equal(result.accepted,false);assert.equal(result.checks.some(c=>c.name==="candidate execution timeout"&&!c.passed),true);assert.ok(Date.now()-start<18000);
 });
 await t.test("cancellation remains an infrastructure condition",async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(()=>evaluate(submission("export const solve=(a,b)=>a+b;"),baseSpec(),{signal:controller.signal}));
 });
});
