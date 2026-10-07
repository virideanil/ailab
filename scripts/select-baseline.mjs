import {readdir,readFile,writeFile,appendFile,mkdir} from "node:fs/promises";
const records=[];
for(const dir of await readdir("tournament")){
 try{const report=JSON.parse(await readFile("tournament/"+dir+"/real.json","utf8"));records.push(report);}catch(error){console.error(dir,error.message);}
}
const preference=["qwen3-4b","coder-3b-research","coder-1.5b"];
const qualified=records.filter(r=>r.suite==="smoke"&&r.arm==="baseline"&&r.complete&&r.runs.length===8&&r.runs.every(x=>x.valid&&x.accepted));
qualified.sort((a,b)=>preference.indexOf(a.modelProfile.profile)-preference.indexOf(b.modelProfile.profile));
const selected=qualified[0]?.modelProfile.profile??"";
await mkdir("artifacts",{recursive:true});
const decision={selected,gate:"all eight unchanged original smoke checks",preference,models:records.map(r=>({profile:r.modelProfile.profile,sourceCommit:r.sourceCommit,accepted:r.runs.filter(x=>x.accepted).length,total:r.runs.length,complete:r.complete})),performanceQualified:false};
await writeFile("artifacts/selection.json",JSON.stringify(decision,null,2));
console.log("BASELINE_SELECTION:"+JSON.stringify(decision));
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,"profile="+selected+"\nqualified="+Boolean(selected)+"\n");
