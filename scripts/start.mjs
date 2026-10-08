import {parseArgs} from "node:util";
import {mkdir,readFile,copyFile} from "node:fs/promises";
import {constants} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn} from "node:child_process";
import {createDashboard} from "../src/dashboard.mjs";
if(Number(process.versions.node.split(".")[0])<24)throw Error("Node.js 24 or newer is required.");
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const {values}=parseArgs({options:{artifacts:{type:"string",default:join(root,"artifacts")},port:{type:"string",default:"8123"},"no-open":{type:"boolean",default:false},empty:{type:"boolean",default:false}}});
const port=Number(values.port);
if(!/^\d+$/.test(values.port)||!Number.isInteger(port)||port<0||port>65535)throw Error("Invalid dashboard port.");
const artifacts=resolve(values.artifacts);await mkdir(artifacts,{recursive:true});
if(!values.empty){
 const manifest=JSON.parse(await readFile(join(root,"docs/handoff-evidence.json"),"utf8"));
 for(const item of manifest.reports){
  if(!/^docs\/validation\/[a-zA-Z0-9_./-]+\.json$/.test(item.path)||item.path.includes("..")||!/^recorded-[a-z0-9-]+\.json$/.test(item.name))throw Error("Invalid recorded evidence path.");
  try{await copyFile(join(root,item.path),join(artifacts,item.name),constants.COPYFILE_EXCL);}
  catch(error){if(error.code!=="EEXIST")throw error;}
 }
}
const server=createDashboard({artifactsDir:artifacts,publicDir:join(root,"public")});
server.on("error",error=>{console.error("Could not open Kovan: "+error.message);process.exitCode=1;server.close();});
server.listen(port,"127.0.0.1",()=>{
 const url="http://127.0.0.1:"+server.address().port;
 console.log("Kovan: "+url+"\nWatching: "+artifacts+"\nRecorded results are historical evidence. New experiments appear live.\nKeep this window open; Control-C stops the GUI.");
 if(process.platform==="darwin"&&!values["no-open"]){const opener=spawn("/usr/bin/open",[url],{stdio:"ignore"});opener.on("error",()=>console.log("Open "+url+" in your browser."));}
});
const stop=()=>server.close(()=>{process.exitCode=0;});
process.once("SIGINT",stop);process.once("SIGTERM",stop);
