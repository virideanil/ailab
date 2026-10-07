import {readdir,readFile,mkdir} from "node:fs/promises";
await mkdir("artifacts",{recursive:true});
for(const name of (await readdir("artifacts")).filter(n=>n.endsWith(".json"))){
 const data=JSON.parse(await readFile("artifacts/"+name,"utf8"));
 console.log("EVIDENCE_JSON:"+JSON.stringify({name,data}));
}
try { console.log("EVIDENCE_JSON:"+JSON.stringify({name:"package-lock.json",data:JSON.parse(await readFile("package-lock.json","utf8"))})); } catch {}
