import { createServer } from "node:http";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

  const MAX_FILE_BYTES=16*1024*1024,MAX_TOTAL_BYTES=32*1024*1024,MAX_FILES=16,MAX_CLIENTS=8;
  const STATIC_FILES=new Map([["/",["index.html","text/html; charset=utf-8"]],["/index.html",["index.html","text/html; charset=utf-8"]],["/app.css",["app.css","text/css; charset=utf-8"]],["/app.mjs",["app.mjs","text/javascript; charset=utf-8"]]]);
  const problem=code=>Object.assign(new Error(code),{code});
  const signature=s=>[s.dev,s.ino,s.size,s.mtimeNs,s.ctimeNs].join(":");
  function validateFile(s){if(!s.isFile())throw problem("NOT_REGULAR_FILE");if(s.size>BigInt(MAX_FILE_BYTES))throw problem("FILE_TOO_LARGE");}
  async function readBounded(path,initialStat){
    const initial=initialStat??await lstat(path,{bigint:true});validateFile(initial);
    const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
    try{
      const before=await handle.stat({bigint:true});validateFile(before);
      const size=Number(before.size),buffer=Buffer.alloc(size+1);let offset=0;
      while(offset<buffer.length){const{bytesRead}=await handle.read(buffer,offset,buffer.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}
      const after=await handle.stat({bigint:true});
      if(offset!==size||signature(before)!==signature(after))throw problem("FILE_CHANGED");
      return{buffer:buffer.subarray(0,offset),signature:signature(after),bytes:offset};
    }finally{await handle.close();}
  }
  const isReport=v=>v!==null&&typeof v==="object"&&!Array.isArray(v)&&v.schemaVersion===1&&Object.hasOwn(v,"design")&&v.design!==null&&typeof v.design==="object"&&!Array.isArray(v.design)&&Array.isArray(v.runs)&&Array.isArray(v.outcomes);
  function createDashboard({artifactsDir,publicDir,pollMs=500}={}){
    if(typeof artifactsDir!=="string"||!artifactsDir||typeof publicDir!=="string"||!publicDir)throw new TypeError("artifactsDir and publicDir required");
    if(!Number.isSafeInteger(pollMs)||pollMs<10||pollMs>60000)throw new RangeError("pollMs outside 10..60000");
    const artifactsRoot=resolve(artifactsDir),publicRoot=resolve(publicDir),clients=new Set();
    let cache=new Map(),serialized=JSON.stringify({runs:[],warnings:[]}),refreshing=null,lastFingerprint="",pollTimer,heartbeatTimer,closed=false;
    const cachedRuns=()=>[...cache.entries()].map(([name,v])=>({name,report:v.report}));
    async function collect(){
      let entries;try{entries=await readdir(artifactsRoot,{withFileTypes:true});}
      catch(e){return{runs:cachedRuns(),warnings:[`Artifacts directory unavailable (${e.code??"READ_ERROR"}); retaining last valid reports.`]};}
      const names=entries.filter(e=>(e.isFile()||e.isSymbolicLink())&&e.name.endsWith(".json")&&!/provenance/i.test(e.name)).map(e=>e.name).sort();
      const warnings=[];if(names.length>MAX_FILES)warnings.push("Report limit: reading the first 16 sorted JSON files.");
      const nextCache=new Map();let totalBytes=0;
      for(const name of names.slice(0,MAX_FILES)){
        let candidate;
        try{
          const path=join(artifactsRoot,name),stat=await lstat(path,{bigint:true});validateFile(stat);
          if(Number(stat.size)+totalBytes>MAX_TOTAL_BYTES){warnings.push(name+": aggregate report budget exceeded; omitted.");continue;}
          const previous=cache.get(name);
          if(previous&&previous.signature===signature(stat))candidate=previous;
          else{
            const read=await readBounded(path,stat),report=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(read.buffer));
            if(!isReport(report)){if(!previous)continue;throw problem("UNRECOGNIZED_REPORT");}
            candidate={report,signature:read.signature,bytes:read.bytes};
          }
        }catch(e){candidate=cache.get(name);warnings.push(name+": "+(e.code??"READ_OR_PARSE_ERROR")+(candidate?"; retaining last valid report.":"; omitted."));}
        if(candidate){
          if(totalBytes+candidate.bytes>MAX_TOTAL_BYTES){warnings.push(name+": aggregate report budget exceeded; omitted.");continue;}
          nextCache.set(name,candidate);totalBytes+=candidate.bytes;
        }
      }
      cache=nextCache;return{runs:cachedRuns(),warnings};
    }
    function broadcast(frame){
      for(const response of clients){
        if(response.destroyed||response.writableNeedDrain){clients.delete(response);response.destroy();continue;}
        response.write(frame);
      }
    }
    function refresh(){
      if(closed)return Promise.resolve();if(refreshing)return refreshing;
      refreshing=collect().catch(()=>({runs:cachedRuns(),warnings:["Report refresh failed; retaining last valid reports."]})).then(payload=>{
        if(closed)return;const fingerprint=JSON.stringify({reports:[...cache].map(([name,r])=>[name,r.signature]),warnings:payload.warnings});if(fingerprint===lastFingerprint)return;lastFingerprint=fingerprint;const next=JSON.stringify(payload);if(next!==serialized){serialized=next;broadcast("event: data\ndata: "+serialized+"\n\n");}
      }).finally(()=>{refreshing=null;});return refreshing;
    }
    function headers(res){
      res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
      res.setHeader("Referrer-Policy","no-referrer");res.setHeader("Cross-Origin-Resource-Policy","same-origin");
      res.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    }
    const json=(res,status,v)=>{res.writeHead(status,{"Content-Type":"application/json; charset=utf-8"});res.end(JSON.stringify(v));};
    function sameOrigin(req){
      const a=server.address();if(!a||typeof a==="string")return false;
      const hosts=new Set(["127.0.0.1:"+a.port,"localhost:"+a.port,"[::1]:"+a.port]);
      if(a.port===80)for(const h of ["127.0.0.1","localhost","[::1]"])hosts.add(h);
      const host=req.headers.host?.toLowerCase();
      return hosts.has(host)&&["127.0.0.1","::1","::ffff:127.0.0.1"].includes(req.socket.remoteAddress)&&(!req.headers.origin||req.headers.origin==="http://"+host);
    }
    async function handle(req,res){
      headers(res);
      if(!sameOrigin(req)){json(res,403,{error:"Local same-origin access required"});return;}
      if(req.method!=="GET"){res.setHeader("Allow","GET");json(res,405,{error:"Method not allowed"});return;}
      const path=(req.url??"").split("?")[0];
      if(path==="/api/runs"||path==="/api/stream"){
        await refresh();if(closed||res.destroyed)return;
        if(path==="/api/runs"){res.writeHead(200,{"Content-Type":"application/json; charset=utf-8"});res.end(serialized);return;}
        if(clients.size>=MAX_CLIENTS){json(res,503,{error:"Too many event streams"});return;}
        res.writeHead(200,{"Content-Type":"text/event-stream; charset=utf-8",Connection:"keep-alive","X-Accel-Buffering":"no"});
        clients.add(res);res.on("close",()=>clients.delete(res));res.on("error",()=>{clients.delete(res);res.destroy();});
        res.write("event: data\ndata: "+serialized+"\n\n");return;
      }
      const asset=STATIC_FILES.get(path);if(!asset){json(res,404,{error:"Not found"});return;}
      try{const{buffer}=await readBounded(join(publicRoot,asset[0]));if(closed||res.destroyed)return;res.writeHead(200,{"Content-Type":asset[1]});res.end(buffer);}
      catch{json(res,404,{error:"Asset unavailable"});}
    }
    const server=createServer((req,res)=>{void handle(req,res).catch(()=>{if(res.destroyed)return;if(res.headersSent)res.destroy();else json(res,500,{error:"Dashboard request failed"});});});
    server.requestTimeout=15000;server.headersTimeout=10000;
    function shutdown(){if(closed)return;closed=true;clearInterval(pollTimer);clearInterval(heartbeatTimer);for(const res of clients)res.destroy();clients.clear();}
    server.on("listening",()=>{pollTimer=setInterval(()=>{void refresh();},pollMs);heartbeatTimer=setInterval(()=>broadcast(": keepalive\n\n"),15000);pollTimer.unref();heartbeatTimer.unref();void refresh();});
    server.on("close",shutdown);const originalClose=server.close.bind(server);
    server.close=function close(callback){shutdown();const result=originalClose(callback);server.closeAllConnections();return result;};
    return server;
  }
  function runCli(){
    const root=dirname(dirname(fileURLToPath(import.meta.url)));
    const{values}=parseArgs({options:{artifacts:{type:"string"},public:{type:"string"},port:{type:"string",default:"8123"}},strict:true,allowPositionals:false});
    const port=Number(values.port);if(!/^\d+$/.test(values.port)||!Number.isInteger(port)||port>65535)throw new RangeError("port outside 0..65535");
    const server=createDashboard({artifactsDir:values.artifacts??join(root,"artifacts"),publicDir:values.public??join(root,"public")});
    server.on("error",e=>{console.error("Dashboard failed: "+e.message);process.exitCode=1;server.close(()=>{});});
    server.listen(port,"127.0.0.1",()=>console.log("Dashboard: http://127.0.0.1:"+server.address().port));
    const stop=()=>server.close(()=>{process.exitCode=0;});process.once("SIGINT",stop);process.once("SIGTERM",stop);
  }
  if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
    try{runCli();}catch(e){console.error("Dashboard failed: "+e.message);process.exitCode=1;}
  }

export { createDashboard };
