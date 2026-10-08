import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../.browser-tests/node_modules/playwright/index.mjs";

  const root=fileURLToPath(new URL("../",import.meta.url)),artifacts=join(root,"artifacts");
  const fixtureDir=await mkdtemp(join(tmpdir(),"kovan-browser-"));
  await mkdir(artifacts,{recursive:true});
  const fake=JSON.parse(await readFile(join(artifacts,"fake.json"),"utf8"));
  assert.equal(fake.mode,"fake");assert.equal(fake.complete,true);assert.equal(fake.runs.length,16);
  let server,browser,serverOutput="",exited=false,exitPromise;
  try{
    server=spawn(process.execPath,["src/dashboard.mjs","--port","0","--artifacts",fixtureDir],{cwd:root,stdio:["ignore","pipe","pipe"]});
    exitPromise=new Promise(resolve=>{server.once("close",()=>{exited=true;resolve();});});
    const base=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Dashboard readiness timeout: "+serverOutput)),10000);
      server.once("error",e=>{clearTimeout(timer);reject(e);});
      server.once("exit",code=>{clearTimeout(timer);reject(new Error("Dashboard exited "+code+": "+serverOutput));});
      server.stderr.on("data",c=>{serverOutput=(serverOutput+c.toString()).slice(-8192);});
      server.stdout.on("data",c=>{
        serverOutput=(serverOutput+c.toString()).slice(-8192);
        const m=serverOutput.match(/Dashboard: (http:\/\/127\.0\.0\.1:\d+)/);
        if(m){clearTimeout(timer);resolve(m[1]);}
      });
    });
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:"reduce"});
    const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
    await page.goto(base,{waitUntil:"domcontentloaded"});
    await page.waitForSelector("#empty-state",{state:"visible"});
    assert.match(await page.title(),/Kovan/);
    assert.equal(await page.locator("#summary").innerText(),"");
    await writeFile(join(fixtureDir,"fake.tmp"),JSON.stringify(fake));
    await rename(join(fixtureDir,"fake.tmp"),join(fixtureDir,"fake.json"));
    await page.waitForSelector("#run-content:not([hidden])");
    await page.waitForFunction(()=>/simulat|fake|harness/i.test(document.querySelector("#mode-badge").textContent));
    await page.waitForFunction(()=>document.querySelectorAll("#task-list tr").length>=8);
    assert.match(await page.locator("#mode-badge").innerText(),/simulat|fake|harness/i);
    assert.ok((await page.locator("#summary").innerText()).length>20);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,"Desktop horizontal overflow");
    const desktop=await page.screenshot({path:join(artifacts,"dashboard-desktop.png"),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,"Mobile horizontal overflow");
    await page.screenshot({path:join(artifacts,"dashboard-mobile.png"),fullPage:true});
    const hostile=structuredClone(fake),marker='<img src=x onerror="window.__kovan_xss=1">';
    hostile.outcomes[0].snapshot={"probe.txt":marker};hostile.outcomes[0].answer=marker;
    await writeFile(join(fixtureDir,"fake.tmp"),JSON.stringify(hostile));
    await rename(join(fixtureDir,"fake.tmp"),join(fixtureDir,"fake.json"));
    // Keep the first outcome selected while SSE brings in the changed report.
    await page.locator("#task-list button").first().click();
    await page.waitForFunction(expected =>
      document.querySelector("#file-text").textContent === expected, marker);
    await page.locator("#file-select").selectOption("probe.txt");
    assert.equal(await page.locator("#file-text").textContent(),marker);
    assert.equal(await page.locator("#file-text img").count(),0);
    assert.equal(await page.evaluate(()=>window.__kovan_xss),undefined);
    const partial=structuredClone(fake);
    partial.complete=false;delete partial.finishedAt;
    partial.runs=partial.runs.slice(0,2);partial.outcomes=partial.outcomes.slice(0,2);
    partial.currentTask={system:"candidate",repeat:0,taskId:"smoke-ttl-boundary",startedAt:new Date().toISOString(),events:[{seq:0,atMs:0,type:"model_request",turn:1}]};
    partial.score={systems:{baseline:{complete:false,acceptedRate:null,cdf:null,t50Ms:null},candidate:{complete:false,acceptedRate:null,cdf:null,t50Ms:null}},comparison:{ready:false,ratioStatus:"incomplete",t50Ratio:null,qualityDelta:null}};
    await writeFile(join(fixtureDir,"fake.tmp"),JSON.stringify(partial));
    await rename(join(fixtureDir,"fake.tmp"),join(fixtureDir,"fake.json"));
    await page.waitForFunction(()=>/running|live|progress/i.test(document.querySelector("#completion-badge").textContent));
    assert.doesNotMatch(await page.locator("#summary").innerText(),/NaN|undefined/);
    const masses = await page.locator("#comparison svg path").evaluateAll(paths => paths.map(path => {
      const ys = [...path.getAttribute("d").matchAll(/ V ([0-9.]+)/g)];
      return ys.length ? 1 - (Number(ys.at(-1)[1]) - 24) / 196 : 0;
    }));
    assert.equal(masses.length, 2);
    for (const mass of masses) assert.ok(Math.abs(mass - 0.8 / 6) < 1e-8, "Chart must use fixed stratum weights");
    assert.match(await page.locator("#comparison").innerText(),/await|pending|incomplete|unavailable|not yet/i);
    const recorded=JSON.parse(await readFile(join(root,"docs/validation/004/coder-3b-research/real.json"),"utf8"));
    assert.equal(recorded.mode,"real");
    await writeFile(join(fixtureDir,"fake.tmp"),JSON.stringify(recorded));
    await rename(join(fixtureDir,"fake.tmp"),join(fixtureDir,"fake.json"));
    await page.waitForFunction(()=>/real/i.test(document.querySelector("#mode-badge").textContent));
    assert.equal(await page.locator("#task-list tr").count(),8);
    assert.doesNotMatch(await page.locator("#summary").innerText(),/NaN|undefined/);
    await page.setViewportSize({width:1440,height:1000});
    await page.screenshot({path:join(artifacts,"dashboard-real-desktop.png"),fullPage:true});
    assert.deepEqual(errors,[],"Browser errors");
    console.log("Browser checks passed: empty state, honest simulation labels, live updates, responsive layout, safe file text, incomplete metrics.");
    console.log("SCREENSHOT_BASE64:"+desktop.toString("base64"));
  }finally{
    await browser?.close();
    if(server&&!exited){
      server.kill("SIGTERM");
      let timer;await Promise.race([exitPromise,new Promise(resolve=>{timer=setTimeout(()=>{server.kill("SIGKILL");resolve();},3000);})]);clearTimeout(timer);
      await exitPromise;
    }
    await rm(fixtureDir,{recursive:true,force:true});
  }
