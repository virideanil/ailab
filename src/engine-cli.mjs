import { parseArgs } from "node:util";
import { mkdir,readFile,writeFile,rename } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { fixtures as smoke } from "../fixtures/smoke.mjs";
import { runEngineTask } from "./engine.mjs";
import { createProposalAdapter } from "./proposal-adapter.mjs";
import { scoreExperiment } from "./scoring.mjs";
const {values:v}=parseArgs({options:{
 endpoint:{type:"string",default:"http://127.0.0.1:8080"},model:{type:"string",default:"local"},
 profile:{type:"string",default:"coder-1.5b"},suite:{type:"string",default:"smoke"},
 arm:{type:"string",default:"baseline"},out:{type:"string",default:"artifacts/engine.json"},
 shard:{type:"string",default:"0"},shards:{type:"string",default:"1"},repeats:{type:"string",default:"1"},
 "system-label":{type:"string",default:""},fake:{type:"boolean",default:false}
}});
const shard=Number(v.shard),shards=Number(v.shards),repeats=Number(v.repeats);
if(!["smoke","pilot","native"].includes(v.suite)||!["baseline","context","native","drafting"].includes(v.arm)||
 !Number.isInteger(shards)||shards<1||shards>60||!Number.isInteger(shard)||shard<0||shard>=shards||
 !Number.isInteger(repeats)||repeats<1||repeats>5)throw Error("Invalid experiment configuration");
if(v.fake&&v.suite!=="smoke")throw Error("Fake path is limited to historical smoke self-test");
const publicKeys=["id","prompt","files","stratum","maxTurns","deadlineMs","outputContract"];
let all,manifest,evaluator;
if(v.suite==="smoke")all=smoke.map((f,i)=>({...f,stratum:i<6?"coding":"general",clusterId:f.task.id}));
else{
 const pilot=await import("../fixtures/pilot.mjs");
 manifest=pilot.pilotManifest;all=pilot.pilotFixtures;
 if(v.suite==="native")all=all.filter(f=>f.ablationEligibility.semanticRename);
 const {createBehavioralEvaluator}=await import("./behavioral-evaluator.mjs");
 evaluator=await createBehavioralEvaluator({image:process.env.EVALUATOR_IMAGE||"node:24-bookworm-slim"});
}
const fixtures=all.filter((_,i)=>i%shards===shard);
const sha=x=>createHash("sha256").update(typeof x==="string"?x:JSON.stringify(x)).digest("hex");
const sources={};
for(const p of ["src/engine.mjs","src/workspace.mjs","src/proposal-adapter.mjs","src/task-contract.mjs","src/engine-cli.mjs","src/scoring.mjs","fixtures/smoke.mjs",...(manifest?["fixtures/pilot.mjs","src/behavioral-evaluator.mjs"]:[]),...(v.arm==="native"?["src/native-edits.mjs"]:[])])
 sources[p]=sha(await readFile(new URL("../"+p,import.meta.url),"utf8"));
const sampling=v.profile==="qwen3-4b"?{temperature:0.7,top_p:0.8,top_k:20,min_p:0,presence_penalty:1.5,chat_template_kwargs:{enable_thinking:false}}:{temperature:0};
const taskSetVersion=manifest?.sha256??sources["fixtures/smoke.mjs"],deadlineMs=30000;
const modelProfile={mode:v.fake?"fake":"real",protocol:"host-proposals-v1",profile:v.profile,model:v.profile,maxTokens:512,seed:42,sampling,cachePrompt:"within-task",deadlineMs};
const systemVersions=Object.fromEntries(["baseline","candidate"].map(system=>[system,sha({sources,modelProfile,system,arm:v.arm})]));
const evaluatorVersion=manifest?sha({source:sources["src/behavioral-evaluator.mjs"],image:evaluator.provenance,manifest:taskSetVersion}):taskSetVersion;
const design={tasks:fixtures.map(f=>({id:f.task.id,version:sha(f.task),clusterId:f.clusterId??f.task.id,stratum:f.task.stratum??f.stratum,deadlineMs})),strataWeights:v.suite==="native"?{coding:1}:{coding:0.8,general:0.2},repeats,systemVersions,evaluatorVersion,taskSetVersion};
const paired=v.arm==="context"||v.arm==="native";
const systems=paired?["baseline","candidate"]:[v["system-label"]||"baseline"];
const report={schemaVersion:1,purpose:"Exploratory engine pilot; no qualified speed claim",mode:modelProfile.mode,performanceClaimEligible:false,
 startedAt:new Date().toISOString(),sourceCommit:process.env.GITHUB_SHA??null,sources,modelProfile,design,manifest,
 suite:v.suite,arm:v.arm,shard,shards,evaluatorProvenance:evaluator?.provenance,
 hardware:{platform:os.platform(),arch:os.arch(),release:os.release(),cpu:os.cpus()[0]?.model,logicalCpus:os.availableParallelism(),totalMemoryBytes:os.totalmem(),node:process.version},
 conditions:{prefillCache:"off on first request of every task; on subsequently",warmup:"one request excluded",order:paired?"counterbalanced by task/repeat":"single arm block",baseline:"sequential observed-file proposals",candidate:v.arm,privateGradingTime:"excluded",preparationTime:"included",hostContract:"identical across arms",memory:"Node RSS per outcome; owned server peak RSS in provenance"},
 runs:[],outcomes:[],currentTask:null};
await mkdir(dirname(v.out),{recursive:true});let queue=Promise.resolve();
function save(){
 if(paired)report.score=scoreExperiment(design,report.runs);
 report.updatedAt=new Date().toISOString();
 const content=JSON.stringify(report,null,2)+"\n";
 queue=queue.then(async()=>{await writeFile(v.out+".tmp",content);await rename(v.out+".tmp",v.out);});return queue;
}
await save();
const adapters={};
if(!v.fake){
 for(const system of systems)adapters[system]=createProposalAdapter({baseUrl:v.endpoint,model:v.model,sampling,native:system==="candidate"&&v.arm==="native"});
 const start=performance.now();
 const warm=await adapters[systems[0]].next({messages:[{role:"user",content:'Return {"type":"finish","answer":"ready"}.'}],turn:1,signal:AbortSignal.timeout(60000)});
 report.warmup={elapsedMs:performance.now()-start,usage:warm.usage};
}
for(let repeat=0;repeat<repeats;repeat++)for(let i=0;i<fixtures.length;i++){
 const fixture=fixtures[i],order=paired&&(i+shard+repeat)%2?[...systems].reverse():systems;
 for(const system of order){
  // Explicit public allowlist: grading specifications and reference solutions cannot enter runtime task.
  const task=Object.fromEntries(publicKeys.filter(k=>Object.hasOwn(fixture.task,k)).map(k=>[k,structuredClone(fixture.task[k])]));
  task.deadlineMs=deadlineMs;task.maxTurns=12;
  let at=0;
  const adapter=v.fake?{kind:"fake",async next(){const {expectedVersion,...action}=fixture.script[at++];return {action};}}:adapters[system];
  const evaluate=fixture.evaluate??((submission,options)=>evaluator(submission,fixture.evaluateSpec,options));
  report.currentTask={taskId:task.id,system,repeat,startedAt:new Date().toISOString(),events:[]};await save();
  const outcome=await runEngineTask({task,adapter,evaluate,contextReuse:system==="candidate"&&v.arm==="context",native:system==="candidate"&&v.arm==="native",
   onEvent(event){report.currentTask.events.push(event);void save().catch(error=>{report.telemetryError=error.message;});}});
  report.currentTask=null;
  report.outcomes.push({system,repeat,...outcome,nodeRssBytes:process.memoryUsage().rss});
  report.runs.push({system,systemVersion:systemVersions[system],evaluatorVersion,taskSetVersion,taskId:task.id,taskVersion:design.tasks[i].version,deadlineMs,repeat,valid:outcome.valid,accepted:outcome.accepted,elapsedMs:outcome.elapsedMs,...(!outcome.valid?{invalidReason:outcome.invalidReason}:{})});
  console.log(JSON.stringify({task:task.id,system,repeat,status:outcome.status,accepted:outcome.accepted,elapsedMs:Math.round(outcome.elapsedMs),turns:outcome.turns}));
  await save();
 }
}
report.complete=report.runs.length===fixtures.length*repeats*systems.length&&report.runs.every(r=>r.valid);
report.qualityGate=report.complete&&report.runs.every(r=>r.accepted);
report.finishedAt=new Date().toISOString();await save();
console.log("ENGINE_SUMMARY:"+JSON.stringify({suite:v.suite,arm:v.arm,profile:v.profile,complete:report.complete,accepted:report.runs.filter(r=>r.accepted).length,total:report.runs.length,qualityGate:report.qualityGate}));
if(!report.complete||(v.fake&&!report.qualityGate))process.exitCode=1;
