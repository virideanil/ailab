
  const $=id=>document.getElementById(id);
  const nodes=Object.fromEntries(["connection-state","run-select","mode-badge","completion-badge","provenance","summary","comparison","task-list","task-title","live-task","event-inspector","file-select","file-text","hardware","warnings","errors","empty-state","run-content","run-count","updated-at"].map(id=>[id,$(id)]));
  const state={runs:[],selectedRun:"",selectedTask:"",selectedFile:"",warnings:[],error:"",receivedAt:null,streamReceived:false};
  const number=v=>typeof v==="number"&&Number.isFinite(v),list=v=>Array.isArray(v)?v:[],text=v=>v==null?"":String(v),json=v=>JSON.stringify(v,null,2)??"";
  const milliseconds=v=>number(v)?(v<1000?`${Math.round(v)} ms`:`${(v/1000).toFixed(2)} s`):"Unavailable";
  const percentage=v=>number(v)?`${(v*100).toFixed(1)}%`:"Unavailable";
  const taskKey=t=>JSON.stringify([t.system,t.repeat,t.taskId]);
  function element(tag,content,className){const n=document.createElement(tag);if(content!=null)n.textContent=text(content);if(className)n.className=className;return n;}
  function put(id,content){if(nodes[id])nodes[id].textContent=text(content);}
  const currentReport=()=>state.runs.find(r=>r.name===state.selectedRun)?.report;
  function connection(label,status){put("connection-state",label);const w=nodes["connection-state"]?.closest(".connection");if(w)w.dataset.state=status;}
  function showErrors(){
    nodes.errors?.replaceChildren(...(state.error?[element("p",state.error,"warning")]:[]));
    nodes.warnings?.replaceChildren(...state.warnings.map(w=>element("p",typeof w==="string"?w:json(w),"warning")));
  }
  function metric(label,value,detail=""){
    const c=element("div",null,"metric metric-card");c.append(element("div",label,"label"),element("div",value,"value"));if(detail)c.append(element("div",detail,"unit"));return c;
  }
  const outcomesOf=r=>list(r?.outcomes).filter(v=>v&&typeof v==="object");
  const systemsOf=r=>Array.isArray(r?.systems)?["baseline","candidate"].filter(s=>r.systems.includes(s)):["baseline","candidate"];
  function assignedCount(r,system){
    if(!systemsOf(r).includes(system))return 0;
    const tasks=r?.design?.tasks,repeats=r?.design?.repeats;
    if(Array.isArray(tasks)&&Number.isSafeInteger(repeats)&&repeats>0)return tasks.length*repeats;
    return null;
  }
  function renderSummary(r){
    const outcomes=outcomesOf(r),accepted=outcomes.filter(o=>o.valid&&o.accepted).length,invalid=outcomes.filter(o=>o.valid===false).length;
    const a=assignedCount(r,"baseline"),b=assignedCount(r,"candidate"),total=number(a)&&number(b)?a+b:null;
    const cards=[metric("Completed",outcomes.length,"Observed task results"),metric("Accepted",accepted,"Results passing the evaluator"),metric("Invalid audits",invalid,"Separate from product failures")];
    if(total!==null)cards.push(metric("Remaining",Math.max(0,total-outcomes.length),`${total} assigned runs`));
    for(const system of systemsOf(r)){
      const stats=r?.score?.systems?.[system],label=system==="baseline"?"Baseline":"Candidate",pending=r.complete!==true&&!r.finishedAt;
      cards.push(metric(`${label} acceptance`,number(stats?.acceptedRate)?percentage(stats.acceptedRate):pending?"Pending":"Unavailable",number(stats?.acceptedRate)?"Weighted acceptance":"Awaiting a complete valid measurement"));
      cards.push(metric(`${label} t50`,number(stats?.t50Ms)?milliseconds(stats.t50Ms):stats?.t50Status==="unreached"?"Not reached":pending?"Pending":"Unavailable","Half of assigned weighted tasks accepted"));
    }
    if(nodes.summary)nodes.summary.dataset.columns=systemsOf(r).length===1?"3":"4";
    nodes.summary?.replaceChildren(...cards);
  }
  function svgElement(tag,attributes={},content){const n=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const[k,v]of Object.entries(attributes))n.setAttribute(k,text(v));if(content!=null)n.textContent=text(content);return n;}
  function renderComparison(r){
    const container=nodes.comparison;if(!container)return;
    const c=r?.score?.comparison,pending=r.complete!==true&&!r.finishedAt;
    const quality=number(c?.qualityDelta)?`${(c.qualityDelta*100).toFixed(1)} percentage points`:pending?"Awaiting complete run":"Unavailable";
    const ratio=number(c?.t50Ratio)?c.t50Ratio.toFixed(3)+"×":pending?"Awaiting complete run":"Unavailable";
    container.replaceChildren(element("p",systemsOf(r).length===1?"Single-arm control. The curve shows measured acceptance over time.":`Acceptance change: ${quality}. Exploratory t50 ratio: ${ratio}.`,"muted"));
    const outcomes=outcomesOf(r),tasks=list(r.design?.tasks),weights=r.design?.strataWeights,repeats=r.design?.repeats;
    const groups=systemsOf(r).map(system=>({system,assigned:assignedCount(r,system),outcomes:outcomes.filter(o=>o.system===system)}));
    const timed=outcomes.filter(o=>number(o.elapsedMs)&&o.elapsedMs>=0);
    const weightsValid=weights&&Object.values(weights).every(w=>number(w)&&w>0)&&Math.abs(Object.values(weights).reduce((a,b)=>a+b,0)-1)<1e-10&&Number.isSafeInteger(repeats)&&repeats>0;
    if(!timed.length||!weightsValid||groups.some(g=>!number(g.assigned)||g.assigned<1)){
      container.append(element("p","The curve awaits measured outcomes and a valid assignment design.","chart-empty"));return;
    }
    const width=640,height=270,left=58,right=22,top=24,bottom=50,pw=width-left-right,ph=height-top-bottom;
    const maxTime=Math.max(1,...timed.map(o=>o.elapsedMs)),x=t=>left+t/maxTime*pw,y=f=>top+(1-f)*ph;
    const svg=svgElement("svg",{viewBox:`0 0 ${width} ${height}`,role:"img","aria-label":"Weighted accepted share of all assigned tasks by elapsed time"});
    svg.append(svgElement("title",{},"Time to accepted result"),svgElement("desc",{},"Fixed stratum weights apply to all assignments. Failed, invalid and pending results never increase accepted mass."));
    for(const f of [0,.25,.5,.75,1]){
      svg.append(svgElement("line",{x1:left,x2:width-right,y1:y(f),y2:y(f),stroke:"currentColor",opacity:.12}));
      svg.append(svgElement("text",{x:left-10,y:y(f)+4,"text-anchor":"end"},`${Math.round(f*100)}%`));
    }
    for(const f of [0,.5,1])svg.append(svgElement("text",{x:x(maxTime*f),y:height-25,"text-anchor":"middle"},milliseconds(maxTime*f)));
    for(const[index,g]of groups.entries()){
      const successes=g.outcomes.filter(o=>o.valid&&o.accepted&&number(o.elapsedMs)&&o.elapsedMs>=0).sort((a,b)=>a.elapsedMs-b.elapsedMs);
      let path=`M ${x(0)} ${y(0)}`,mass=0;
      for(const o of successes){
        const task=tasks.find(t=>t.id===o.taskId);if(!task||!number(weights[task.stratum]))continue;
        const count=tasks.filter(t=>t.stratum===task.stratum).length;
        mass+=weights[task.stratum]/count/repeats;
        path+=` H ${x(o.elapsedMs)} V ${y(Math.min(1,mass))}`;
      }
      path+=` H ${x(maxTime)}`;
      svg.append(svgElement("path",{d:path,fill:"none",stroke:g.system==="candidate"?"#a7c7b0":"#c99774","stroke-width":3,"stroke-dasharray":g.system==="candidate"?"none":"6 4"}));
    }
    container.append(svg,element("p",`${systemsOf(r).map(s=>s==="baseline"?"Dashed copper: baseline.":"Solid jade: candidate.").join(" ")} Fixed weights: ${Object.entries(weights).map(([k,v])=>`${k} ${Math.round(v*100)}%`).join(" · ")}. All assignments remain in the denominator.`,"chart-legend"));
    container.append(element("p","Point estimates only. This exploratory experiment does not establish a performance gain.","muted"));
  }
  function renderRows(r={}){
    const body=nodes["task-list"];if(!body)return;
    const outcomes=outcomesOf(r),active=r.currentTask&&typeof r.currentTask==="object"?r.currentTask:null;
    const rows=outcomes.map(o=>({...o,live:false}));if(active&&!rows.some(o=>taskKey(o)===taskKey(active)))rows.push({...active,live:true});
    if(!rows.some(o=>taskKey(o)===state.selectedTask)){state.selectedTask=rows.length?taskKey(rows.at(-1)):"";state.selectedFile="";}
    const focused=document.activeElement?.dataset?.taskKey;
    const fragments=rows.map(row=>{
      const key=taskKey(row),selected=key===state.selectedTask,tr=element("tr",null,`task-row${selected?" selected":""}`),first=element("td"),button=element("button",row.taskId);
      button.type="button";button.dataset.taskKey=key;button.setAttribute("aria-pressed",String(selected));
      button.addEventListener("click",()=>{state.selectedTask=key;state.selectedFile="";renderRows(currentReport());renderInspector(currentReport());});
      first.append(button,element("div",`${text(row.system)} · repeat ${text(row.repeat??0)}`,"muted"));
      const outcome=row.live?"Running":row.valid===false?`Invalid · ${text(row.status)}`:row.accepted?"Accepted":text(row.status?"Not accepted · "+row.status:"Not accepted");
      const status=element("td");status.append(element("span",outcome,`status-pill ${row.accepted?"passed":row.live?"":"failed"}`));
      tr.append(first,status,element("td",row.live?"In progress":milliseconds(row.elapsedMs)),element("td",number(row.turns)?row.turns:"—"));return tr;
    });
    body.replaceChildren(...fragments);
    if(!rows.length){const row=element("tr"),cell=element("td","No completed or active task has been reported.","muted");cell.colSpan=4;row.append(cell);body.append(row);}
    if(focused)[...body.querySelectorAll("button")].find(b=>b.dataset.taskKey===focused)?.focus();
  }
  const selectedTask=r=>outcomesOf(r).find(o=>taskKey(o)===state.selectedTask)??(r?.currentTask&&taskKey(r.currentTask)===state.selectedTask?r.currentTask:null);
  function renderInspector(r){
    const task=selectedTask(r);put("task-title",task?`${text(task.taskId)} · ${text(task.system)}`:"Task inspector");
    const inspector=nodes["event-inspector"];
    if(inspector){
      const events=list(task?.events);
      inspector.replaceChildren(...events.map(event=>{
        const row=element("div",null,"event-row");row.append(element("div",`${number(event.atMs)?milliseconds(event.atMs):"—"} · ${text(event.type)}`,"label"),element("pre",json(event),"code-block"));return row;
      }));
      if(task?.checks!=null){const checks=element("div",null,"event-row");checks.append(element("div","Evaluator checks","label"),element("pre",json(task.checks),"code-block"));inspector.append(checks);}
      if(!events.length)inspector.prepend(element("p","No events reported.","muted"));
      if(task?.invalidReason)inspector.prepend(element("p","Audit unavailable: "+task.invalidReason,"warning"));
      if(task?.answer)inspector.append(element("pre",task.answer,"code-block"));
      if(task?.manifest){const d=element("details");d.append(element("summary","Submitted file fingerprints"),element("pre",json(task.manifest),"code-block"));inspector.append(d);}
    }
    const snapshot=task?.snapshot&&typeof task.snapshot==="object"?task.snapshot:{},paths=Object.keys(snapshot).sort();
    if(!paths.includes(state.selectedFile))state.selectedFile=paths[0]??"";
    const select=nodes["file-select"];
    if(select){select.replaceChildren(...paths.map(path=>{const o=element("option",path);o.value=path;return o;}));select.disabled=!paths.length;select.value=state.selectedFile;}
    put("file-text",state.selectedFile?text(snapshot[state.selectedFile]):"No submitted file snapshot is available for this task.");
  }
  function renderLive(){
    const task=currentReport()?.currentTask;
    if(!task){put("live-task",currentReport()?.phase==="warming"?"Warming the model. No measured task is running.":"Inference activity: idle. Telemetry connection is shown separately.");return;}
    const started=typeof task.startedAt==="number"?task.startedAt:Date.parse(task.startedAt);
    const elapsed=Number.isFinite(started)?` · live elapsed ${milliseconds(Math.max(0,Date.now()-started))}`:"";
    put("live-task",`Running ${text(task.taskId)} · ${text(task.system)}${elapsed}. Live wall-clock estimate; not a completed-task metric.`);
  }
  function render(){
    const select=nodes["run-select"];
    if(!state.runs.some(r=>r.name===state.selectedRun)){state.selectedRun=state.runs[0]?.name??"";state.selectedTask="";}
    if(select){
      const names=state.runs.map(r=>r.name);
      if(JSON.stringify([...select.options].map(o=>o.value))!==JSON.stringify(names))select.replaceChildren(...names.map(name=>{const o=element("option",name);o.value=name;return o;}));
      select.value=state.selectedRun;select.disabled=!names.length;
    }
    put("run-count",`${state.runs.length} report${state.runs.length===1?"":"s"}`);
    const r=currentReport();if(nodes["run-content"])nodes["run-content"].hidden=!r;if(nodes["empty-state"])nodes["empty-state"].hidden=Boolean(r);showErrors();if(!r)return;
    const fake=r.mode==="fake";
    put("mode-badge",fake?"FAKE · scripted adapters":r.mode==="real"?"REAL · model run":"Mode unspecified");
    if(nodes["mode-badge"])nodes["mode-badge"].dataset.mode=text(r.mode);
    put("completion-badge",r.complete===true?"Complete":r.phase==="warming"?"Warming model":r.currentTask?"Running · measured so far":"Measured so far · incomplete");
    put("provenance",fake?"Scripted adapter test. These measurements exercise the harness; they are not AI model performance.":r.mode==="real"?"Real model run. Interpret results with the recorded hardware and run configuration.":"This report does not declare whether a real model was used.");
    const provenance=element("details");provenance.append(element("summary","Model, source and measurement conditions"),element("pre",json({suite:r.suite,arm:r.arm,systems:r.systems,manifest:r.manifest,evaluatorProvenance:r.evaluatorProvenance,decision:r.decision,modelProfile:r.modelProfile,sourceCommit:r.sourceCommit,sources:r.sources,conditions:r.conditions}),"code-block"));nodes.provenance?.append(provenance);
    nodes.hardware?.replaceChildren(element("pre",json(r.hardware??"Hardware not reported"),"code-block"));
    if(state.receivedAt){put("updated-at",`Received ${state.receivedAt.toLocaleTimeString()}`);nodes["updated-at"]?.setAttribute("datetime",state.receivedAt.toISOString());}
    renderSummary(r);renderComparison(r);renderRows(r);renderInspector(r);renderLive();
  }
  function receive(envelope){
    if(!envelope||!Array.isArray(envelope.runs))throw new Error("Invalid report envelope");
    state.runs=envelope.runs.filter(r=>r&&typeof r.name==="string"&&r.report&&typeof r.report==="object");
    state.warnings=list(envelope.warnings);state.error="";state.receivedAt=new Date();render();
  }
  nodes["run-select"]?.addEventListener("change",e=>{state.selectedRun=e.target.value;state.selectedTask="";state.selectedFile="";render();});
  nodes["file-select"]?.addEventListener("change",e=>{state.selectedFile=e.target.value;renderInspector(currentReport());});
  nodes["task-list"]?.addEventListener("keydown",e=>{
    if(!["ArrowUp","ArrowDown","Home","End"].includes(e.key))return;
    const buttons=[...nodes["task-list"].querySelectorAll("button")],index=buttons.indexOf(document.activeElement);if(index<0)return;e.preventDefault();
    const next=e.key==="Home"?0:e.key==="End"?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(e.key==="ArrowDown"?1:-1)));buttons[next]?.focus();
  });
  connection("Connecting telemetry…","connecting");
  const stream=new EventSource("/api/stream");
  stream.addEventListener("open",()=>connection("Telemetry connected","connected"));
  stream.addEventListener("data",event=>{try{receive(JSON.parse(event.data));state.streamReceived=true;}catch(e){state.error=`Report update could not be read: ${e.message}`;showErrors();}});
  stream.addEventListener("error",()=>connection(stream.readyState===EventSource.CLOSED?"Telemetry disconnected":"Telemetry reconnecting…","disconnected"));
  fetch("/api/runs",{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();}).then(v=>{if(!state.streamReceived)receive(v);}).catch(e=>{if(state.streamReceived)return;state.error=`Reports could not be loaded: ${e.message}`;showErrors();});
  const ticker=setInterval(renderLive,500);
  window.addEventListener("pagehide",()=>{clearInterval(ticker);stream.close();},{once:true});
  render();
