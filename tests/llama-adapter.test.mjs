import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createLlamaAdapter } from "../src/llama-adapter.mjs";

  const messages=[{role:"user",content:"Inspect."}],done={type:"finish",answer:"done"};
  const completion=(action=done,finish="stop")=>({choices:[{finish_reason:finish,message:{content:JSON.stringify(action)}}],usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20}});
  async function fixture(t,handler){
    const server=createServer((req,res)=>{Promise.resolve(handler(req,res)).catch(e=>{res.statusCode=500;res.end(e.message);});});
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
    t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
    return`http://127.0.0.1:${server.address().port}`;
  }
  const json=(res,value)=>{res.setHeader("content-type","application/json");res.end(JSON.stringify(value));};
  test("public chat, numeric schema and cache policy reach real adapter",async t=>{
    let request;
    const baseUrl=await fixture(t,async(req,res)=>{const a=[];for await(const c of req)a.push(c);request=JSON.parse(Buffer.concat(a));assert.equal(req.url,"/v1/chat/completions");json(res,completion());});
    const adapter=createLlamaAdapter({baseUrl:baseUrl+"/v1",model:"test"});
    const result=await adapter.next({messages,task:{evaluator:"SECRET"}});
    assert.equal(adapter.kind,"real");assert.deepEqual(result.action,done);assert.equal(request.cache_prompt,false);
    assert.equal(request.max_tokens,256);assert.equal(request.seed,42);assert.equal(request.temperature,0);
    assert.equal(JSON.stringify(request).includes("SECRET"),false);
    const types=request.response_format.json_schema.schema.oneOf;assert.equal(types.length,5);
    assert.equal(types.find(x=>x.properties.type.enum[0]==="replace_text").properties.expectedVersion.type,"integer");
  });
  test("endpoint and numeric settings fail closed",()=>{
    for(const baseUrl of ["https://127.0.0.1","http://example.com","http://127.0.0.1.evil","http://user@127.0.0.1","http://127.0.0.1/x","http://127.0.0.1/?x=1"])assert.throws(()=>createLlamaAdapter({baseUrl}));
    assert.doesNotThrow(()=>createLlamaAdapter({baseUrl:"http://[::1]:8080"}));
    assert.match(createLlamaAdapter({baseUrl:"http://localhost:8080"}).id,/127\.0\.0\.1/);
    for(const c of [{maxTokens:0},{maxResponseBytes:Infinity},{seed:-1},{temperature:NaN}])assert.throws(()=>createLlamaAdapter(c));
  });
  test("HTTP failures and redirects never fake success",async t=>{
    let followed=false;const baseUrl=await fixture(t,(req,res)=>{if(req.url==="/leak")followed=true;res.writeHead(302,{location:"/leak"});res.end();});
    await assert.rejects(createLlamaAdapter({baseUrl}).next({messages}));assert.equal(followed,false);
    const failing=await fixture(t,(_req,res)=>{res.writeHead(503);res.end("no");});
    await assert.rejects(createLlamaAdapter({baseUrl:failing}).next({messages}),/HTTP 503/);
  });
  test("malformed, truncated and mismatched action shapes reject",async t=>{
    const cases=["not json",JSON.stringify({choices:[]}),JSON.stringify(completion(done,"length")),JSON.stringify(completion({type:"read_file"})),JSON.stringify(completion({type:"finish",answer:"x",command:"bad"})),JSON.stringify(completion({type:"__proto__"})),JSON.stringify(completion({type:"list_files",path:"a"})),JSON.stringify(completion({type:"search",query:"x",path:"a"})),JSON.stringify(completion({type:"replace_text",path:"a",expectedVersion:"1",oldText:"a",newText:"b"}))];
    for(const value of cases){const baseUrl=await fixture(t,(_req,res)=>res.end(value));await assert.rejects(createLlamaAdapter({baseUrl}).next({messages}));}
  });
  test("response byte cap accounts for multibyte text",async t=>{
    const baseUrl=await fixture(t,(_req,res)=>res.end("1234🙂"));
    await assert.rejects(createLlamaAdapter({baseUrl,maxResponseBytes:7}).next({messages}),/byte limit/);
  });
  test("numeric CAS deletion and missing usage accepted",async t=>{
    const action={type:"replace_text",path:"a",expectedVersion:1,oldText:"remove",newText:""};
    const baseUrl=await fixture(t,(_req,res)=>{const p=completion(action);delete p.usage;json(res,p);});
    assert.deepEqual(await createLlamaAdapter({baseUrl}).next({messages}),{action,usage:{}});
  });
  test("abort before headers and during response body",{timeout:5000},async t=>{
    for(const headers of [false,true]){
      let started;const ready=new Promise(r=>{started=r;});
      const baseUrl=await fixture(t,(_req,res)=>{if(headers){res.writeHead(200);res.write('{"choices":[');}started();});
      const controller=new AbortController();
      const rejected=assert.rejects(createLlamaAdapter({baseUrl}).next({messages,signal:controller.signal}),e=>e.name==="AbortError");
      await ready;controller.abort();await rejected;
    }
  });
