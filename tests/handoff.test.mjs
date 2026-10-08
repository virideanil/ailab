import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtemp,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
test("Mac/portable launcher serves preserved real evidence and shuts down cleanly",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"kovan-handoff-"));
 const child=spawn(process.execPath,["scripts/start.mjs","--no-open","--port","0","--artifacts",directory],{stdio:["ignore","pipe","pipe"]});
 let output="";const closed=new Promise(resolve=>child.once("close",(code,signal)=>resolve({code,signal})));
 try{
  const url=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error("Launcher timeout: "+output)),10000);
   child.once("error",error=>{clearTimeout(timer);reject(error);});
   child.stderr.on("data",chunk=>{output+=chunk;});
   child.stdout.on("data",chunk=>{output+=chunk;const match=output.match(/Kovan: (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timer);resolve(match[1]);}});
   child.once("exit",code=>{clearTimeout(timer);reject(Error("Launcher exited "+code+": "+output));});
  });
  const response=await fetch(url+"/api/runs");assert.equal(response.status,200);
  const payload=await response.json();assert.equal(payload.warnings.length,0);
  assert.ok(payload.runs.length>=4);
  assert.ok(payload.runs.every(run=>run.report.mode==="real"));
  const historical=payload.runs.find(run=>run.name==="recorded-003-coder-15b.json");
  assert.ok(historical);assert.equal(historical.report.runs.filter(r=>r.accepted).length,0);
  const manifest=JSON.parse(await readFile("docs/handoff-evidence.json","utf8"));
  for(const item of manifest.reports)assert.equal(await readFile(join(directory,item.name),"utf8"),await readFile(item.path,"utf8"));
 }finally{
  child.kill("SIGTERM");let timer;await Promise.race([closed,new Promise(resolve=>{timer=setTimeout(()=>{child.kill("SIGKILL");resolve();},3000);})]);clearTimeout(timer);await closed;await rm(directory,{recursive:true,force:true});
 }
});
