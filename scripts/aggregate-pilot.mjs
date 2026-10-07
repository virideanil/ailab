import {readdir,readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {pilotFixtures} from "../fixtures/pilot.mjs";
import {scoreExperiment} from "../src/scoring.mjs";
await mkdir("artifacts",{recursive:true});
for(const experiment of ["context","native","drafting"]){
 const reports=[];
 for(const dir of await readdir("results"))if(dir.startsWith(experiment+"-")){
  try{reports.push(JSON.parse(await readFile("results/"+dir+"/real.json","utf8")));}catch(error){console.error(dir,error.message);}
 }
 const expectedShards=experiment==="native"?1:6;
 if(!reports.length){await writeFile("artifacts/"+experiment+"-missing.json",JSON.stringify({experiment,missing:true}));continue;}
 const first=reports[0],assigned=experiment==="native"?pilotFixtures.filter(f=>f.ablationEligibility.semanticRename):pilotFixtures;
 const design={...first.design,tasks:assigned.map(f=>({id:f.task.id,version:createHash("sha256").update(JSON.stringify(f.task)).digest("hex"),clusterId:f.clusterId??f.task.id,stratum:f.task.stratum,deadlineMs:30000}))};
 for(const report of reports)for(const key of ["taskSetVersion","evaluatorVersion","systemVersions"]){
  if(JSON.stringify(report.design[key])!==JSON.stringify(first.design[key]))throw Error("Mixed "+key+" in "+experiment);
 }
 const runs=reports.flatMap(r=>r.runs),score=scoreExperiment(design,runs);
 const complete=reports.length===expectedShards&&reports.every(r=>r.complete);
 const aggregate={...first,currentTask:null,shardStatus:reports.map(r=>({shard:r.shard,complete:r.complete,lastActiveTask:r.currentTask})),shard:null,design,runs,outcomes:reports.flatMap(r=>r.outcomes),score,complete,
 hardware:reports.map(r=>({shard:r.shard,...r.hardware})),conditions:{...first.conditions,aggregation:"Each baseline/candidate pair runs on the same shard host. Different shards may use different CPUs."},
 decision:{promoted:false,reason:!complete?"Missing or invalid evidence":score.comparison.qualityDelta<0?"Observed quality regression":"Exploratory point estimates require independent confirmation; no automatic promotion"},finishedAt:new Date().toISOString()};
 await writeFile("artifacts/"+experiment+".json",JSON.stringify(aggregate,null,2));
 console.log("EXPERIMENT_SUMMARY:"+JSON.stringify({experiment,complete,comparison:score.comparison,pairedOutcomes:score.pairedOutcomes,accepted:Object.fromEntries(["baseline","candidate"].map(system=>[system,runs.filter(r=>r.system===system&&r.accepted).length])),total:runs.length,decision:aggregate.decision}));
}
