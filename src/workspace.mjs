import { createHash } from "node:crypto";

  // Bounded in-memory fixture storage. This is NOT an operating-system sandbox.
  const DEFAULTS = {maxFiles:128,maxPathBytes:1024,maxFileBytes:65536,maxTotalBytes:1048576,maxOutputBytes:8388608,maxSearchResults:100};
  const bytes = x => Buffer.byteLength(x,"utf8");
  function fail(code,message){throw Object.assign(new Error(`${code}: ${message}`),{code});}
  function entries(value,label){
    if(value===null||typeof value!=="object"||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.getOwnPropertySymbols(value).length)
      fail("INVALID_INPUT",`${label} must be a plain record`);
    return Object.entries(Object.getOwnPropertyDescriptors(value)).map(([k,d])=>{
      if(!Object.hasOwn(d,"value")||!d.enumerable)fail("INVALID_INPUT",`${label} must have data properties`);
      return [k,d.value];
    });
  }
  function integer(x,label){if(!Number.isSafeInteger(x)||x<0)fail("INVALID_LIMIT",label);return x;}
  function createWorkspace(initialFiles,overrides={}){
    const limits={...DEFAULTS};
    for(const[k,v]of entries(overrides,"limits")){
      if(!Object.hasOwn(DEFAULTS,k))fail("INVALID_LIMIT",k);
      limits[k]=integer(v,k);
    }
    function normalize(path){
      if(typeof path!=="string"||!path||path.startsWith("/")||/^[a-z]:/i.test(path)||path.includes("\\")||path.includes("\0")||path.split("/").includes(".."))fail("INVALID_PATH","relative POSIX path required");
      if(bytes(path)>limits.maxPathBytes)fail("PATH_LIMIT","path too long");
      const result=path.split("/").filter(x=>x&&x!==".").join("/");
      if(!result)fail("INVALID_PATH","file required");
      return result;
    }
    function output(value,budget=limits.maxOutputBytes){
      if(bytes(JSON.stringify(value))>budget)fail("OUTPUT_LIMIT","serialized output too large");
      return value;
    }
    function file(content,version){
      if(typeof content!=="string")fail("INVALID_CONTENT","string required");
      const size=bytes(content);if(size>limits.maxFileBytes)fail("FILE_LIMIT","file too large");
      return{content,version,bytes:size,sha256:createHash("sha256").update(content,"utf8").digest("hex")};
    }
    const source=entries(initialFiles,"initialFiles"),files=new Map();let total=0;
    if(source.length>limits.maxFiles)fail("FILE_COUNT_LIMIT","too many files");
    for(const[p,c]of source){
      const path=normalize(p);if(files.has(path))fail("DUPLICATE_PATH",path);
      const f=file(c,1);total+=f.bytes;
      if(!Number.isSafeInteger(total)||total>limits.maxTotalBytes)fail("TOTAL_LIMIT","workspace too large");
      files.set(path,f);
    }
    const paths=()=>[...files.keys()].sort();
    function get(path){path=normalize(path);if(!files.has(path))fail("NOT_FOUND",path);return{path,f:files.get(path)};}
    function list(){return output(Object.freeze(paths()));}
    function read(path){const item=get(path);return output(Object.freeze({path:item.path,content:item.f.content,version:item.f.version}));}
    function search(query,options={}){
      if(typeof query!=="string"||!query)fail("INVALID_QUERY","nonempty literal required");
      let cap=limits.maxSearchResults,budget=limits.maxOutputBytes;
      for(const[k,v]of entries(options,"options")){
        if(k==="maxResults")cap=Math.min(integer(v,k),cap);
        else if(k==="maxOutputBytes")budget=Math.min(integer(v,k),budget);
        else fail("INVALID_INPUT",k);
      }
      const matches=[];let truncated=false,used=bytes(JSON.stringify({matches:[],truncated:false}));
      if(used>budget)fail("OUTPUT_LIMIT","search envelope too large");
      scan:for(const path of paths()){
        const content=files.get(path).content;
        for(let index=content.indexOf(query);index!==-1;index=content.indexOf(query,index+1)){
          if(matches.length>=cap){truncated=true;break scan;}
          const prefix=content.slice(0,index),start=prefix.lastIndexOf("\n")+1,end=content.indexOf("\n",index);
          const match=Object.freeze({path,line:prefix.split("\n").length,column:index-start+1,text:content.slice(start,end===-1?content.length:end)});
          const added=bytes(JSON.stringify(match))+(matches.length?1:0);
          if(used+added>budget){truncated=true;break scan;}
          matches.push(match);used+=added;
        }
      }
      return output(Object.freeze({matches:Object.freeze(matches),truncated}),budget);
    }
    function replaceText(change){
      const args=Object.fromEntries(entries(change,"replacement"));
      if(Object.keys(args).some(k=>!["path","expectedVersion","oldText","newText"].includes(k)))fail("INVALID_INPUT","unknown replacement property");
      const{path,f}=get(args.path);
      if(!Number.isSafeInteger(args.expectedVersion)||args.expectedVersion<1)fail("INVALID_VERSION","positive integer required");
      if(args.expectedVersion!==f.version)fail("STALE_VERSION","read again");
      if(typeof args.oldText!=="string"||!args.oldText||typeof args.newText!=="string")fail("INVALID_REPLACEMENT","literal strings required");
      const index=f.content.indexOf(args.oldText);
      if(index===-1)fail("TEXT_NOT_FOUND","no match");
      if(f.content.indexOf(args.oldText,index+1)!==-1)fail("AMBIGUOUS_REPLACEMENT","unique match required");
      const version=f.version+1;if(!Number.isSafeInteger(version))fail("VERSION_LIMIT","exhausted");
      const content=f.content.slice(0,index)+args.newText+f.content.slice(index+args.oldText.length);
      const next=file(content,version),nextTotal=total-f.bytes+next.bytes;
      if(!Number.isSafeInteger(nextTotal)||nextTotal>limits.maxTotalBytes)fail("TOTAL_LIMIT","replacement too large");
      const result=output(Object.freeze({path,content,version}));
      files.set(path,next);total=nextTotal;return result;
    }
    function applyChanges(changes){
      if(!Array.isArray(changes)||!changes.length)fail("INVALID_INPUT","nonempty changes required");
      const pending=new Map();let nextTotal=total;
      for(const change of changes){
        const args=Object.fromEntries(entries(change,"change"));
        if(Object.keys(args).sort().join(",")!=="content,expectedVersion,path")fail("INVALID_INPUT","change fields");
        const {path,f}=get(args.path);
        if(pending.has(path))fail("DUPLICATE_PATH",path);
        if(args.expectedVersion!==f.version)fail("STALE_VERSION","read again");
        if(args.content===f.content)fail("NO_CHANGE",path);
        if(!Number.isSafeInteger(f.version+1))fail("VERSION_LIMIT","exhausted");
        const next=file(args.content,f.version+1);pending.set(path,next);
        nextTotal+=next.bytes-f.bytes;
      }
      if(!Number.isSafeInteger(nextTotal)||nextTotal>limits.maxTotalBytes)fail("TOTAL_LIMIT","changes too large");
      const result=output(Object.freeze([...pending].map(([path,f])=>Object.freeze({path,content:f.content,version:f.version}))));
      for(const [path,f] of pending)files.set(path,f);
      total=nextTotal;return result;
    }
    function snapshot(){return output(Object.freeze(Object.fromEntries(paths().map(p=>[p,files.get(p).content]))));}
    function manifest(){return output(Object.freeze(Object.fromEntries(paths().map(p=>{
      const{version,sha256,bytes}=files.get(p);return[p,Object.freeze({version,sha256,bytes})];
    }))));}
    return Object.freeze({list,read,search,replaceText,applyChanges,snapshot,manifest});
  }

export { createWorkspace };
