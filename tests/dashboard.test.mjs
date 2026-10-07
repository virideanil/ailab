import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdtemp, mkdir, rename, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDashboard } from "../src/dashboard.mjs";

  const report=marker=>({schemaVersion:1,design:{name:"test"},runs:[],outcomes:[],marker,currentTask:{id:"task-"+marker,status:"running"}});
  async function fixture(t){
    const root=await mkdtemp(join(tmpdir(),"local-ai-dashboard-")),artifactsDir=join(root,"artifacts"),publicDir=join(root,"public");
    await Promise.all([mkdir(artifactsDir),mkdir(publicDir)]);
    await Promise.all([writeFile(join(publicDir,"index.html"),"<!doctype html><title>Lab</title>"),writeFile(join(publicDir,"app.css"),"body { color: white; }"),writeFile(join(publicDir,"app.mjs"),"export const ready=true;")]);
    const server=createDashboard({artifactsDir,publicDir,pollMs:20});
    await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
    const base="http://127.0.0.1:"+server.address().port;
    t.after(async()=>{if(server.listening)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await rm(root,{recursive:true,force:true});});
    return{root,artifactsDir,publicDir,server,base};
  }
  function rawGet(base,path,headers={}){
    const u=new URL(base);return new Promise((resolve,reject)=>{
      const req=request({hostname:u.hostname,port:u.port,path,method:"GET",headers},res=>{
        const chunks=[];res.on("data",c=>chunks.push(c));res.on("end",()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString("utf8")}));res.on("error",reject);
      });req.on("error",reject);req.end();
    });
  }
  function eventReader(reader){
    const decoder=new TextDecoder();let pending="";
    return async function nextData(){
      for(;;){
        let boundary=pending.indexOf("\n\n");
        while(boundary!==-1){const block=pending.slice(0,boundary);pending=pending.slice(boundary+2);
          if(block.startsWith("event: data\n")){const line=block.split("\n").find(v=>v.startsWith("data: "));if(line)return JSON.parse(line.slice(6));}
          boundary=pending.indexOf("\n\n");
        }
        const value=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("SSE timeout")),3000);reader.read().then(v=>{clearTimeout(timer);resolve(v);},e=>{clearTimeout(timer);reject(e);});});
        if(value.done)throw new Error("SSE ended");pending+=decoder.decode(value.value,{stream:true});
      }
    };
  }
  test("sorted valid reports; provenance and unrelated JSON excluded",async t=>{
    const f=await fixture(t);
    await Promise.all([writeFile(join(f.artifactsDir,"z.json"),JSON.stringify(report("z"))),writeFile(join(f.artifactsDir,"a.json"),JSON.stringify(report("a"))),writeFile(join(f.artifactsDir,"provenance.json"),JSON.stringify(report("hidden"))),writeFile(join(f.artifactsDir,"unrelated.json"),'{"hello":"world"}'),writeFile(join(f.artifactsDir,"wrong.json"),JSON.stringify({...report("wrong"),outcomes:{}}))]);
    const r=await fetch(f.base+"/api/runs"),p=await r.json();assert.equal(r.status,200);assert.equal(r.headers.get("access-control-allow-origin"),null);
    assert.deepEqual(p.runs.map(r=>r.name),["a.json","z.json"]);assert.deepEqual(p.runs[0].report,report("a"));assert.deepEqual(p.warnings,[]);
  });
  test("static allowlist, raw traversal and methods",async t=>{
    const f=await fixture(t);assert.equal((await fetch(f.base+"/")).status,200);
    const css=await fetch(f.base+"/app.css");assert.match(css.headers.get("content-type"),/^text\/css/);assert.match(await css.text(),/color: white/);
    assert.equal((await fetch(f.base+"/app.mjs")).status,200);
    for(const p of ["/../index.html","/%2e%2e/index.html","/%2findex.html","/artifacts/a.json","/package.json","/api/run"])assert.equal((await rawGet(f.base,p)).status,404,p);
    const post=await fetch(f.base+"/api/runs",{method:"POST"});assert.equal(post.status,405);assert.equal(post.headers.get("allow"),"GET");
  });
  test("foreign Host and Origin rejected",async t=>{
    const f=await fixture(t);assert.equal((await rawGet(f.base,"/api/runs",{Host:"attacker.example"})).status,403);
    assert.equal((await rawGet(f.base,"/api/runs",{Origin:"https://attacker.example"})).status,403);assert.equal((await rawGet(f.base,"/api/runs",{Origin:f.base})).status,200);
  });
  test("SSE retains valid snapshot through partial writes and publishes replacement",{timeout:10000},async t=>{
    const f=await fixture(t),file=join(f.artifactsDir,"live.json");await writeFile(file,JSON.stringify(report("first")));
    const abort=new AbortController(),r=await fetch(f.base+"/api/stream",{signal:abort.signal}),reader=r.body.getReader();
    t.after(async()=>{abort.abort();await reader.cancel().catch(()=>{});});
    const next=eventReader(reader);assert.match(r.headers.get("content-type"),/^text\/event-stream/);assert.equal((await next()).runs[0].report.marker,"first");
    await writeFile(file,'{"schemaVersion":1,');const partial=await next();assert.equal(partial.runs[0].report.marker,"first");assert.ok(partial.warnings.some(w=>w.includes("retaining last valid report")));
    const tmp=join(f.artifactsDir,"live.tmp");await writeFile(tmp,JSON.stringify(report("second")));await rename(tmp,file);
    const updated=await next();assert.equal(updated.runs[0].report.marker,"second");assert.deepEqual(updated.runs[0].report.currentTask,{id:"task-second",status:"running"});assert.deepEqual(updated.warnings,[]);
  });
  test("server.close terminates SSE and timers",{timeout:5000},async t=>{
    const f=await fixture(t),abort=new AbortController(),r=await fetch(f.base+"/api/stream",{signal:abort.signal}),reader=r.body.getReader();
    t.after(async()=>{abort.abort();await reader.cancel().catch(()=>{});});await eventReader(reader)();
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("close stalled")),2000);f.server.close(e=>{clearTimeout(timer);e?reject(e):resolve();});});
    assert.equal(f.server.listening,false);
  });
  test("sixteen report cap visible",async t=>{
    const f=await fixture(t);await Promise.all(Array.from({length:17},(_,i)=>writeFile(join(f.artifactsDir,String(i).padStart(2,"0")+".json"),JSON.stringify(report(i)))));
    const p=await(await fetch(f.base+"/api/runs")).json();assert.equal(p.runs.length,16);assert.equal(p.runs[0].name,"00.json");assert.equal(p.runs.at(-1).name,"15.json");assert.ok(p.warnings.some(w=>w.includes("Report limit")));
  });
  test("oversized files rejected without full read",async t=>{
    const f=await fixture(t),file=join(f.artifactsDir,"oversized.json");await writeFile(file,"");await truncate(file,16*1024*1024+1);
    const p=await(await fetch(f.base+"/api/runs")).json();assert.deepEqual(p.runs,[]);assert.ok(p.warnings.some(w=>w.includes("FILE_TOO_LARGE")));
  });
  test("artifact and static symlinks are not followed",{skip:process.platform==="win32"},async t=>{
    const f=await fixture(t),external=join(f.root,"external.json");await writeFile(external,JSON.stringify(report("secret")));await symlink(external,join(f.artifactsDir,"linked.json"));
    await rm(join(f.publicDir,"app.mjs"));await symlink(external,join(f.publicDir,"app.mjs"));
    const p=await(await fetch(f.base+"/api/runs")).json();assert.deepEqual(p.runs,[]);assert.ok(p.warnings.some(w=>w.includes("NOT_REGULAR_FILE")));assert.equal((await fetch(f.base+"/app.mjs")).status,404);
  });
  test("missing artifacts directory explicitly warned",async t=>{
    const f=await fixture(t);await rm(f.artifactsDir,{recursive:true});const p=await(await fetch(f.base+"/api/runs")).json();assert.deepEqual(p.runs,[]);assert.ok(p.warnings.some(w=>w.includes("Artifacts directory unavailable")));
  });
  test("configuration rejected before opening listener",()=>{
    assert.throws(()=>createDashboard(),TypeError);assert.throws(()=>createDashboard({artifactsDir:"/tmp",publicDir:"/tmp",pollMs:0}),RangeError);assert.throws(()=>createDashboard({artifactsDir:"/tmp",publicDir:"/tmp",pollMs:Infinity}),RangeError);
  });
