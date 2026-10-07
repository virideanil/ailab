import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {pilotFixtures,pilotManifest} from "../fixtures/pilot.mjs";
import {createBehavioralEvaluator} from "../src/behavioral-evaluator.mjs";
const evaluator=await createBehavioralEvaluator({image:process.env.EVALUATOR_IMAGE||"node:24-bookworm-slim"});
const results=[];
for(const f of pilotFixtures){
 assert.deepEqual(Object.keys(f.task).sort(),["deadlineMs","files","id","maxTurns","outputContract","prompt","stratum"]);
 const reference={snapshot:f.referenceFiles??f.task.files,answer:f.referenceAnswer??"done"};
 const good=await evaluator(reference,f.evaluateSpec);
 const bad=await evaluator({snapshot:f.task.files,answer:f.task.stratum==="general"?"INTENTIONALLY_WRONG":"done"},f.evaluateSpec);
 results.push({task:f.task.id,referenceAccepted:good.accepted,starterRejected:!bad.accepted,checks:good.checks});
 assert.equal(good.accepted,true,"Reference rejected "+f.task.id+" "+JSON.stringify(good));
 assert.equal(bad.accepted,false,"Starter accepted "+f.task.id);
}
await mkdir("artifacts",{recursive:true});
await writeFile("artifacts/pilot-admission.json",JSON.stringify({manifest:pilotManifest,evaluator:evaluator.provenance,results},null,2));
console.log("PILOT_ADMISSION:"+JSON.stringify({manifest:pilotManifest,referencesPassed:results.length,startersRejected:results.length,evaluator:evaluator.provenance}));
