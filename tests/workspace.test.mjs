import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspace } from "../src/workspace.mjs";

  const code=c=>e=>e.code===c;
  const edit=(w,oldText,newText,expectedVersion=1)=>w.replaceText({path:"a",oldText,newText,expectedVersion});
  test("normalization and duplicate paths",()=>{
    const w=createWorkspace({"z":"z","src//./a":"a"});
    assert.deepEqual(w.list(),["src/a","z"]);assert.equal(w.read("src/./a").version,1);
    assert.throws(()=>createWorkspace({"a/b":"x","a//b":"y"}),code("DUPLICATE_PATH"));
  });
  test("reject traversal, absolute, drive, backslash and NUL paths",()=>{
    for(const p of ["",".","./","/","/tmp/a","../a","a/../b","a\\b","C:/x","C:x","a\0b"]){
      assert.throws(()=>createWorkspace({[p]:"x"}),code("INVALID_PATH"));
      assert.throws(()=>createWorkspace({a:"x"}).read(p),code("INVALID_PATH"));
    }
  });
  test("CAS changes once; stale writes do not mutate",()=>{
    const w=createWorkspace({a:"before target after"}),before=w.snapshot();
    assert.equal(edit(w,"target","replacement").version,2);
    const m=w.manifest();assert.throws(()=>edit(w,"replacement","bad"),code("STALE_VERSION"));
    assert.deepEqual(w.manifest(),m);assert.equal(before.a,"before target after");
  });
  test("reject empty, missing, repeated and overlapping targets atomically",()=>{
    for(const[c,o,k]of [["abc","","INVALID_REPLACEMENT"],["abc","x","TEXT_NOT_FOUND"],["x x","x","AMBIGUOUS_REPLACEMENT"],["aaa","aa","AMBIGUOUS_REPLACEMENT"]]){
      const w=createWorkspace({a:c}),m=w.manifest();assert.throws(()=>edit(w,o,"new"),code(k));assert.deepEqual(w.manifest(),m);
    }
  });
  test("version/content validation and literal deletion",()=>{
    const w=createWorkspace({a:"abc"});
    for(const v of [0,-1,1.5,"1",null,NaN])assert.throws(()=>edit(w,"b","",v),code("INVALID_VERSION"));
    assert.throws(()=>edit(w,"b",null),code("INVALID_REPLACEMENT"));
    assert.equal(edit(w,"b","").content,"ac");
  });
  test("detached frozen plain snapshots safely retain special property names",()=>{
    const input=Object.fromEntries([["__proto__","p"],["constructor","c"],["a","abc"]]);
    const w=createWorkspace(input),s=w.snapshot();input.a="outside";
    assert.equal(s.__proto__,"p");assert.equal(Object.getPrototypeOf(s),Object.prototype);
    assert.deepEqual(JSON.parse(JSON.stringify(s)),s);assert.throws(()=>{s.a="bad";},TypeError);
    edit(w,"abc","def");assert.equal(s.a,"abc");assert.equal(w.snapshot().a,"def");
  });
  test("SHA-256 and UTF8 byte manifest",()=>{
    const w=createWorkspace({a:"abc",emoji:"🙂"}),m=w.manifest();
    assert.equal(m.a.sha256,"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(m.emoji.bytes,4);assert.ok(Object.isFrozen(m.a));
    edit(w,"abc","abcd");assert.equal(m.a.version,1);assert.equal(w.manifest().a.version,2);
  });
  test("literal overlapping search and UTF16 columns",()=>{
    const w=createWorkspace({z:"aa",a:"aaa\n🙂x\n.*"});
    assert.deepEqual(w.search("aa",{maxResults:2}),{matches:[{path:"a",line:1,column:1,text:"aaa"},{path:"a",line:1,column:2,text:"aaa"}],truncated:true});
    assert.equal(w.search(".*").matches[0].line,3);assert.equal(w.search("x").matches[0].column,3);
    assert.throws(()=>w.search(""),code("INVALID_QUERY"));
  });
  test("search truncation accurately marks missing matches",()=>{
    const w=createWorkspace({a:"xx"},{maxSearchResults:1});
    assert.equal(w.search("x",{maxResults:999}).truncated,true);
    assert.equal(w.search("xx").truncated,false);
    assert.equal(w.search("x",{maxResults:0}).truncated,true);
    assert.equal(w.search("absent",{maxResults:0}).truncated,false);
  });
  test("output cap preserves complete records",()=>{
    const w=createWorkspace({a:"x".repeat(200)});
    assert.deepEqual(w.search("x",{maxOutputBytes:100}),{matches:[],truncated:true});
    assert.throws(()=>w.search("x",{maxOutputBytes:1}),code("OUTPUT_LIMIT"));
  });
  test("storage limits account for UTF8 bytes",()=>{
    assert.throws(()=>createWorkspace({a:"",b:""},{maxFiles:1}),code("FILE_COUNT_LIMIT"));
    assert.throws(()=>createWorkspace({"🙂":""},{maxPathBytes:3}),code("PATH_LIMIT"));
    assert.throws(()=>createWorkspace({a:"🙂"},{maxFileBytes:3}),code("FILE_LIMIT"));
    const w=createWorkspace({a:"aa",b:"bb"},{maxTotalBytes:4}),m=w.manifest();
    assert.throws(()=>edit(w,"aa","aaa"),code("TOTAL_LIMIT"));assert.deepEqual(w.manifest(),m);
  });
  test("replacement response overflow is rejected before mutation",()=>{
    const w=createWorkspace({a:"abc"},{maxOutputBytes:80});
    assert.throws(()=>edit(w,"abc","x".repeat(80)),code("OUTPUT_LIMIT"));assert.equal(w.read("a").content,"abc");
  });
  test("all read APIs enforce serialized output budgets",()=>{
    const w=createWorkspace({a:"abc"},{maxOutputBytes:1});
    for(const f of [()=>w.list(),()=>w.read("a"),()=>w.manifest(),()=>w.snapshot()])assert.throws(f,code("OUTPUT_LIMIT"));
  });
  test("invalid records, limits and getters fail closed",()=>{
    for(const x of [null,[],new Map(),"files"])assert.throws(()=>createWorkspace(x),code("INVALID_INPUT"));
    for(const x of [-1,0.5,Infinity,NaN,"10",null])assert.throws(()=>createWorkspace({},{maxFiles:x}),code("INVALID_LIMIT"));
    assert.throws(()=>createWorkspace({},{unknown:1}),code("INVALID_LIMIT"));
    let invoked=false;const input=Object.defineProperty({},"a",{enumerable:true,get(){invoked=true;return"x";}});
    assert.throws(()=>createWorkspace(input),code("INVALID_INPUT"));assert.equal(invoked,false);
    assert.deepEqual(createWorkspace({},{maxFiles:0}).snapshot(),{});
  });
