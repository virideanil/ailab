import {spawn} from "node:child_process";
import {readFile,rename,writeFile} from "node:fs/promises";
const profile=process.env.MODEL_PROFILE,shard=process.env.PILOT_SHARD??"0";
if(!profile||!/^[0-5]$/.test(shard))throw Error("Missing validated experiment inputs");
const order=Number(shard)%2?["candidate","baseline"]:["baseline","candidate"];
for(const system of order){
 const args=["scripts/engine-gguf.mjs","--profile",profile,"--suite","pilot","--arm","drafting","--shard",shard,"--shards","6","--system-label",system,...(system==="candidate"?["--draft"]:[])];
 const child=spawn(process.execPath,args,{stdio:"inherit"});
 await new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",code=>code===0?resolve():reject(Error("Draft arm exited "+code)));});
 for(const name of ["real.json","real-provenance.json","llama-server.log"])await rename("artifacts/"+name,"artifacts/"+system+"-"+name);
}
const baseline=JSON.parse(await readFile("artifacts/baseline-real.json","utf8"));
const candidate=JSON.parse(await readFile("artifacts/candidate-real.json","utf8"));
for(const key of ["taskSetVersion","evaluatorVersion"])if(baseline.design[key]!==candidate.design[key])throw Error("Mixed "+key);
const combined={...baseline,conditions:{...baseline.conditions,order:"separate server blocks, order counterbalanced by shard: "+order.join(",")+"; residual within-host time confounding remains"},
 runs:[...baseline.runs,...candidate.runs],outcomes:[...baseline.outcomes,...candidate.outcomes],complete:baseline.complete&&candidate.complete};
const {scoreExperiment}=await import("../src/scoring.mjs");combined.score=scoreExperiment(combined.design,combined.runs);
await writeFile("artifacts/real.json",JSON.stringify(combined,null,2));
