import {parseArgs} from "node:util";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {mkdir,open,stat,link,rm} from "node:fs/promises";
import {resolve,join} from "node:path";
import {modelProfiles} from "../src/model-profiles.mjs";
const {values}=parseArgs({options:{profile:{type:"string",default:"qwen3-4b"},directory:{type:"string",default:"models"}}});
const p=modelProfiles[values.profile];if(!p)throw Error("Unknown pinned model profile.");
const directory=resolve(values.directory),destination=join(directory,p.filename);await mkdir(directory,{recursive:true});
async function digest(path){const hash=createHash("sha256");for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest("hex");}
try{const st=await stat(destination);if(st.size===p.bytes&&await digest(destination)===p.sha256){console.log("Already verified: "+destination);process.exit(0);}throw Error("Existing model differs from its pinned digest; move it aside explicitly before retrying.");}catch(error){if(error.code!=="ENOENT")throw error;}
console.log("Downloading "+values.profile+" ("+(p.bytes/1e9).toFixed(2)+" GB), license "+(p.license??"see publisher")+".");
const temporary=destination+".download-"+process.pid,file=await open(temporary,"wx");let bytes=0,nextProgress=0;
try{
 const response=await fetch("https://huggingface.co/"+p.repository+"/resolve/"+p.revision+"/"+p.filename,{signal:AbortSignal.timeout(30*60*1000)});
 if(!response.ok||!response.body||!response.url.startsWith("https://"))throw Error("Model download failed: HTTP "+response.status);
 const hash=createHash("sha256");
 for await(const chunk of response.body){
  bytes+=chunk.length;if(bytes>p.bytes)throw Error("Downloaded model exceeds pinned byte count.");
  hash.update(chunk);let offset=0;while(offset<chunk.length){const r=await file.write(chunk,offset,chunk.length-offset);if(!r.bytesWritten)throw Error("Model write failed.");offset+=r.bytesWritten;}
  if(bytes>=nextProgress){console.log(Math.floor(100*bytes/p.bytes)+"%");nextProgress=bytes+128*1024*1024;}
 }
 if(bytes!==p.bytes||hash.digest("hex")!==p.sha256)throw Error("Model size or SHA-256 mismatch.");
 await file.close();await link(temporary,destination);await rm(temporary);
 console.log("Verified: "+destination+"\nSHA-256: "+p.sha256);
}catch(error){await file.close().catch(()=>{});await rm(temporary,{force:true});throw error;}
