import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import {proposeRename} from "../src/native-edits.mjs";
const rename=(snapshot,extra={})=>proposeRename(snapshot,{path:"src/main.mjs",oldName:"oldName",newName:"newName",...extra});
const contents=result=>Object.fromEntries(result.changes.map(change=>[change.path,change.content]));
const refused=fn=>assert.throws(fn,error=>error.code==="NATIVE_RENAME_REFUSED");
test("rename preserves shadowed locals and does not mutate its snapshot",()=>{
 const snapshot={"src/main.mjs":"export const oldName = 2;\nexport function local() { const oldName = 3; return oldName; }\nexport function add(value) { return value + oldName; }","README.md":"oldName is prose."},before=structuredClone(snapshot),result=rename(snapshot);
 assert.equal(result.locations,2);
 assert.equal(contents(result)["src/main.mjs"],"export const newName = 2;\nexport function local() { const oldName = 3; return oldName; }\nexport function add(value) { return value + newName; }");
 assert.deepEqual(snapshot,before);
});
test("comments strings property keys and shorthand shape are preserved",()=>{
 const output=contents(rename({"src/main.mjs":'export function oldName(value) { return value; }\n// oldName stays.\nexport const description = "oldName";\nexport const record = { oldName };\nexport const other = { oldName: 4 };\nexport const answer = record.oldName(3) + other.oldName;'}))["src/main.mjs"];
 assert.match(output,/function newName\(value\)/);assert.match(output,/record = \{ oldName: newName \}/);assert.match(output,/\/\/ oldName stays/);assert.match(output,/description = "oldName"/);assert.match(output,/other = \{ oldName: 4 \}/);assert.match(output,/record\.oldName\(3\) \+ other\.oldName/);
});
test("direct exports and imports are renamed across the virtual module graph",()=>{
 const result=rename({"src/main.mjs":"export function oldName(value) { return value + 1; }\n","src/use.mjs":'import { oldName } from "./main.mjs";\nexport const result = oldName(2);\n'});
 assert.equal(result.locations,3);
 assert.deepEqual(contents(result),{"src/main.mjs":"export function newName(value) { return value + 1; }\n","src/use.mjs":'import { newName } from "./main.mjs";\nexport const result = newName(2);\n'});
});
test("explicit importer aliases remain stable",()=>{
 const output=contents(rename({"src/main.mjs":"export function oldName() { return 1; }","src/use.mjs":'import { oldName as local } from "./main.mjs"; export const result = local();'}));
 assert.equal(output["src/use.mjs"],'import { newName as local } from "./main.mjs"; export const result = local();');
});
test("collisions and lexical capture are refused",()=>{
 for(const snapshot of [
 {"src/main.mjs":"export const oldName = 1; const newName = 2; export const result = oldName + newName;"},
 {"src/main.mjs":"export function oldName() { return 1; } export function use(newName) { return oldName() + newName(); }"},
 {"src/main.mjs":"export function oldName() { return 1; }","src/use.mjs":'import { oldName } from "./main.mjs"; const newName = () => 2; export const result = oldName() + newName();'}
 ])refused(()=>rename(snapshot));
});
test("invalid names, missing bindings, duplicates and destructuring are refused",()=>{
 const snapshot={"src/main.mjs":"export const oldName = 1;"};
 for(const newName of ["for","await","new-name","x; injected()","","oldName"])refused(()=>rename(snapshot,{newName}));
 refused(()=>rename(snapshot,{oldName:"missing"}));
 refused(()=>rename({"src/main.mjs":"var oldName = 1; var oldName = 2; export { oldName };"}));
 refused(()=>rename({"src/main.mjs":"const { oldName } = { oldName: 1 }; export { oldName };"}));
});
test("syntax errors, missing bindings, imports and suppressed diagnostics are refused",()=>{
 for(const content of ["export const oldName = ;","export const oldName = missingValue;","// @ts-nocheck\nexport const oldName = missingValue;","// @ts-ignore\nexport const oldName = missingValue;",'import {value} from "outside-package"; export const oldName = value;','import {value} from "../../outside.mjs"; export const oldName = value;'])refused(()=>rename({"src/main.mjs":content}));
});
test("typed modules use virtual relative resolution",()=>{
 const output=contents(rename({"src/main.mts":"export function oldName(value:number):number {return value+1;}","src/use.mts":'import {oldName} from "./main.mjs";export const result:number=oldName(2);'},{path:"src/main.mts"}));
 assert.match(output["src/main.mts"],/function newName/);assert.match(output["src/use.mts"],/result:number=newName\(2\)/);
});
test("declared string, array, Math and Object API subset works",()=>{
 const output=contents(rename({"src/main.mjs":'export function oldName(value){return String(value).trim().toLowerCase().replace(/x/g,"y");}\nexport const result=[" X "].slice().map(oldName).filter(value=>value.length>0).sort().join(",");\nexport const limit=Math.min(1,2);\nexport const own=Object.hasOwn({x:1},"x");'}))["src/main.mjs"];
 assert.match(output,/function newName/);assert.match(output,/\.map\(newName\)/);
});
test("unsafe paths and accessors are refused without invoking getters",()=>{
 refused(()=>rename({"../outside.mjs":"export const oldName=1;"}));
 refused(()=>rename({"src/main.tsx":"export const oldName=1;"},{path:"src/main.tsx"}));
 refused(()=>rename({"src/main.js":"const oldName=1;"},{path:"src/main.js"}));
 let invoked=false;const snapshot=Object.defineProperty({},"src/main.mjs",{enumerable:true,get(){invoked=true;return "export const oldName=1;";}});
 refused(()=>rename(snapshot));assert.equal(invoked,false);
});
test("project access never falls back to TypeScript OS filesystem",()=>{
 const names=["readFile","writeFile","fileExists","directoryExists","readDirectory","getDirectories","realpath"],original=new Map(names.map(name=>[name,ts.sys[name]]));let calls=0;
 try{
  for(const name of names)ts.sys[name]=()=>{calls++;throw Error("OS lookup forbidden");};
  assert.equal(rename({"src/main.mjs":"export const oldName=1;","src/use.mjs":'import {oldName} from "./main.mjs";export const result=oldName+1;'}).changes.length,2);assert.equal(calls,0);
 }finally{for(const [name,value]of original){if(value===undefined)delete ts.sys[name];else ts.sys[name]=value;}}
});

test("frozen native pilot proposals update every declared caller",async()=>{
 const {pilotFixtures}=await import("../fixtures/pilot.mjs");
 for(const fixture of pilotFixtures.filter(f=>f.ablationEligibility.semanticRename)){
  const spec=fixture.evaluateSpec;
  const result=proposeRename(fixture.task.files,{path:spec.entry,oldName:spec.forbiddenExports[0],newName:spec.exportName});
  assert.deepEqual(result.changes.map(c=>c.path).sort(),["src/helper.mjs","src/report.mjs","src/task.mjs"],fixture.task.id);
 }
});
