import test from "node:test";
import assert from "node:assert/strict";
import {parseUniqueJson,parseProposalEnvelope} from "../src/json-envelope.mjs";
test("only a complete unambiguous JSON proposal is normalized",()=>{
 const source=JSON.stringify({name:"read_file",arguments:{path:"a.mjs"}});
 assert.equal(parseProposalEnvelope(source).mode,"json-object");
 assert.deepEqual(parseProposalEnvelope("\n```json\n"+source+"\n```\n").envelope,{name:"read_file",arguments:{path:"a.mjs"}});
 for(const bad of ["Here is "+source,source+" done",source+source,"```\n"+source+"\n```","```json\n"+source,'{"name":"finish","name":"read_file","arguments":{}}','{"name":"finish","arguments":{},"extra":1}','{"name":"finish","arguments":"{}"}','{"name":"finish","arguments":[]}'])assert.throws(()=>parseProposalEnvelope(bad),undefined,bad);
});
test("duplicate keys are rejected at every depth and after Unicode unescaping",()=>{
 for(const bad of ['{"a":1,"a":2}','{"a":{"b":1,"b":2}}','[{"a":1,"\\u0061":2}]'])assert.throws(()=>parseUniqueJson(bad),/Duplicate/);
 const value={a:[true,false,null,-12.5e2,{text:'commas, braces{} quotes" and backticks```',other:[]}],b:{}};
 assert.deepEqual(parseUniqueJson(JSON.stringify(value)),value);
 assert.throws(()=>parseUniqueJson("[".repeat(34)+"0"+"]".repeat(34)),/nesting/);
});
