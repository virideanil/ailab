import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { modelProfiles } from "../src/model-profiles.mjs";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, openSync, writeSync, closeSync } from "node:fs";
import { mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

  if(process.platform!=="linux"||process.arch!=="x64"||Number(process.versions.node.split(".")[0])<24)throw new Error("Requires Linux x64 and Node24+");
  const { values } = parseArgs({ options: { profile: { type: "string", default: "coder-0.5b" } } });
  if (!Object.hasOwn(modelProfiles, values.profile)) throw new Error("Unknown GGUF profile: " + values.profile);
  const modelProfile = modelProfiles[values.profile];
  const root=fileURLToPath(new URL("../",import.meta.url)),artifacts=join(root,"artifacts");
  await mkdir(artifacts,{recursive:true});
  const work=await mkdtemp(join(tmpdir(),"gguf-smoke-")),output=join(artifacts,"real.json"),provenanceFile=join(artifacts,"real-provenance.json");
  const controller=new AbortController(),owned=new Set(),MiB=1024*1024;
  const { repository: MODEL_REPO, filename: MODEL_FILE, sha256: MODEL_SHA, revision: MODEL_REVISION, bytes: MODEL_BYTES } = modelProfile;
  const ARCHIVE_SHA="f6d25dde8f51133143d1453da4fd5f73b145127177612a283bf7995957af3392";
  const ARCHIVE_URL="https://github.com/ggml-org/llama.cpp/releases/download/b11429/llama-b11429-bin-ubuntu-x64.tar.gz";
  const provenance={startedAt:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,runtimeTag:"b11429",runtimeArchiveSha256:ARCHIVE_SHA,modelProfile:values.profile,modelRepository:MODEL_REPO,modelRevision:MODEL_REVISION,modelFile:MODEL_FILE,modelSha256:MODEL_SHA,expectedModelBytes:MODEL_BYTES,status:"running",qualityGate:false};
  let logFd=null,logBytes=0;
  function signalGroup(record,signal){if(!record.child.pid)return;try{process.kill(-record.child.pid,signal);}catch(e){if(e.code!=="ESRCH")throw e;}}
  function groupExists(record){if(!record.child.pid)return false;try{process.kill(-record.child.pid,0);return true;}catch(e){if(e.code==="ESRCH")return false;throw e;}}
  function bounded(promise,ms,abortable=true){
    let timer,abort;
    const limit=new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error("Operation timed out")),ms);
      if(abortable){abort=()=>reject(controller.signal.reason);controller.signal.addEventListener("abort",abort,{once:true});if(controller.signal.aborted)abort();}
    });
    return Promise.race([promise,limit]).finally(()=>{clearTimeout(timer);if(abort)controller.signal.removeEventListener("abort",abort);});
  }
  function launch(command,args,options={}){
    controller.signal.throwIfAborted();
    const child=spawn(command,args,{cwd:root,detached:true,stdio:"inherit",...options}),record={child,error:null,closed:false};
    record.done=new Promise(resolve=>{
      child.once("error",error=>{record.error=error;});
      child.once("close",(code,signal)=>{record.closed=true;resolve({code,signal,error:record.error});});
    });owned.add(record);return record;
  }
  async function stop(record){
    try{
      signalGroup(record,"SIGTERM");const until=Date.now()+3000;
      while(groupExists(record)&&Date.now()<until)await delay(100);
      if(groupExists(record))signalGroup(record,"SIGKILL");
      await bounded(record.done,3000,false);const killedUntil=Date.now()+1000;
      while(groupExists(record)&&Date.now()<killedUntil)await delay(100);
      if(groupExists(record))throw new Error("Owned process group survived");
      owned.delete(record);
    }catch(e){signalGroup(record,"SIGKILL");record.child.stdout?.destroy();record.child.stderr?.destroy();record.child.unref();throw e;}
  }
  async function command(command,args,ms){
    const record=launch(command,args);
    try{const result=await bounded(record.done,ms);if(result.error||result.code!==0)throw result.error??new Error(`${command} exited ${result.code}/${result.signal}`);}
    finally{await stop(record);}
  }
  async function consume(url,cap,sink,timeoutMs){
    const response=await fetch(url,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(timeoutMs)]),headers:{"User-Agent":"local-ai-gguf-smoke/1"}});
    if(!response.ok||!response.body){await response.body?.cancel();throw new Error(`Download HTTP ${response.status}`);}
    if(!response.url.startsWith("https://")){await response.body.cancel();throw new Error("Non-HTTPS redirect");}
    if(Number(response.headers.get("content-length"))>cap){await response.body.cancel();throw new Error("Declared download too large");}
    let bytes=0;for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>cap)throw new Error("Download cap exceeded");await sink(chunk);}return bytes;
  }
  async function download(url,path,digest,cap){
    const file=await open(path,"wx"),hash=createHash("sha256");let bytes;
    try{bytes=await consume(url,cap,async chunk=>{
      hash.update(chunk);let offset=0;while(offset<chunk.length){const r=await file.write(chunk,offset,chunk.length-offset);if(!r.bytesWritten)throw new Error("Zero-byte write");offset+=r.bytesWritten;}
    },360000);}finally{await file.close();}
    if(hash.digest("hex")!==digest)throw new Error("SHA-256 mismatch");return bytes;
  }
  async function findServers(dir){
    const found=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())found.push(...await findServers(p));else if(e.isFile()&&e.name==="llama-server")found.push(p);}return found;
  }
  async function freePort(){
    const server=createServer();await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",resolve);});
    const port=server.address().port;await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));return port;
  }
  function log(chunk){
    const bytes=Math.min(chunk.length,Math.max(0,8*MiB-logBytes));if(bytes<chunk.length)provenance.serverLogTruncated=true;
    let offset=0;while(offset<bytes)offset+=writeSync(logFd,chunk,offset,bytes-offset);logBytes+=bytes;
  }
  const softTimer=setTimeout(()=>controller.abort(new Error("14-minute deadline")),14*60000);
  const hardTimer=setTimeout(()=>{for(const r of owned){try{signalGroup(r,"SIGKILL");}catch{}}console.error("Hard smoke deadline");process.exit(124);},15*60000);
  for(const signal of ["SIGINT","SIGTERM"])process.once(signal,()=>controller.abort(new Error(`Received ${signal}`)));
  try{
    console.log("Using immutable GGUF profile: " + values.profile);
    const archive=join(work,"runtime.tar.gz"),model=join(work,MODEL_FILE);
    provenance.runtimeDownloadBytes=await download(ARCHIVE_URL,archive,ARCHIVE_SHA,64*MiB);
    provenance.modelDownloadBytes=await download(`https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REVISION}/${MODEL_FILE}`,model,MODEL_SHA,MODEL_BYTES);
    if (provenance.modelDownloadBytes !== MODEL_BYTES) throw new Error("Model byte size mismatch");
    await command("/usr/bin/tar",["--extract","--gzip","--file",archive,"--directory",work,"--no-same-owner","--no-same-permissions"],60000);
    const servers=await findServers(work);if(servers.length!==1)throw new Error("Expected exactly one llama-server");
    const binary=servers[0],hash=createHash("sha256");for await(const chunk of createReadStream(binary))hash.update(chunk);
    provenance.serverBinarySha256=hash.digest("hex");
    const alias=`gguf-smoke-${randomUUID()}`,port=await freePort(),endpoint=`http://127.0.0.1:${port}`;
    const args=["--model",model,"--alias",alias,"--host","127.0.0.1","--port",String(port),"--ctx-size","4096","--threads","2","--threads-batch","2","--parallel","1","--n-gpu-layers","0"];
    provenance.serverArguments=args;provenance.endpoint=endpoint;
    logFd=openSync(join(artifacts,"llama-server.log"),"w");
    const server=launch(binary,args,{stdio:["ignore","pipe","pipe"],env:{...process.env,LD_LIBRARY_PATH:dirname(binary),OMP_NUM_THREADS:"2",OPENBLAS_NUM_THREADS:"2"}});
    for(const stream of [server.child.stdout,server.child.stderr])stream.on("data",chunk=>{try{log(chunk);}catch(e){controller.abort(e);}});
    const healthDeadline=Date.now()+120000;let healthy=false;
    while(Date.now()<healthDeadline){
      controller.signal.throwIfAborted();if(server.closed)throw new Error("llama-server exited before readiness");
      try{
        const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(2000)]);
        const health=await fetch(`${endpoint}/health`,{signal}),ok=health.ok;await health.body?.cancel();
        if(ok){const models=await fetch(`${endpoint}/v1/models`,{signal}),body=await models.json();healthy=models.ok&&body.data?.some(m=>m.id===alias);if(healthy&&!server.closed)break;}
      }catch(e){if(controller.signal.aborted)throw e;}
      await delay(250,null,{signal:controller.signal});
    }
    if(!healthy||server.closed)throw new Error("Owned server readiness timed out");
    await writeFile(provenanceFile,JSON.stringify(provenance,null,2));await rm(output,{force:true});
    await command(process.execPath,["src/cli.mjs","--endpoint",endpoint,"--model",alias,"--out",output,"--repeats","1"],10*60000);
    JSON.parse(await readFile(output,"utf8"));provenance.status="completed";
  }catch(e){provenance.status="infrastructure_failed";provenance.error=e.message;process.exitCode=1;console.error(e.message);}
  finally{
    const cleanup=await Promise.allSettled([...owned].map(stop));
    provenance.cleanupErrors=cleanup.filter(r=>r.status==="rejected").map(r=>r.reason.message);
    if(provenance.cleanupErrors.length){provenance.status="cleanup_failed";process.exitCode=1;}
    if(logFd!==null)closeSync(logFd);
    provenance.finishedAt=new Date().toISOString();await writeFile(provenanceFile,JSON.stringify(provenance,null,2));
    await rm(work,{recursive:true,force:true});clearTimeout(softTimer);clearTimeout(hardTimer);
  }
