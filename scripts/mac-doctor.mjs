import os from "node:os";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {mkdir,writeFile,access} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {join,dirname} from "node:path";
const exec=promisify(execFile),root=dirname(dirname(fileURLToPath(import.meta.url)));
async function probe(command,args){try{const r=await exec(command,args,{timeout:10000,maxBuffer:65536,cwd:root});return {available:true,output:(r.stdout+"\n"+r.stderr).trim()};}catch(error){return {available:false,error:error.code??error.message};}}
const report={createdAt:new Date().toISOString(),purpose:"Device setup check, not a performance result",hardware:{platform:os.platform(),arch:os.arch(),release:os.release(),cpu:os.cpus()[0]?.model,logicalCpus:os.availableParallelism(),memoryBytes:os.totalmem()},node:process.version,nodeSupported:Number(process.versions.node.split(".")[0])>=24};
const [llama,docker,git]=await Promise.all([probe("llama-server",["--version"]),probe("docker",["info","--format","{{.OSType}}"]),probe("git",["rev-parse","HEAD"])]);
report.llama=llama;report.docker=docker;report.checkout=git.available?git.output:null;
try{await access(join(root,"node_modules/typescript/package.json"));report.dependenciesInstalled=true;}catch{report.dependenciesInstalled=false;}
await mkdir(join(root,"artifacts"),{recursive:true});
await writeFile(join(root,"artifacts/mac-doctor.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
console.log("\nGUI: npm start\nDependencies: npm ci\nNative runtime: install a trusted Metal-enabled llama.cpp build.\nDocker is optional for viewing/smoke; required for isolated behavioral coding tests.\nFull instructions: docs/MAC-HANDOFF.md");
if(!report.nodeSupported)process.exitCode=1;
