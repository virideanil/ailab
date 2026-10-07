import { performance } from "node:perf_hooks";
import { compileContract, finishContract } from "./task-contract.mjs";
import { createWorkspace } from "./workspace.mjs";

  class Stop extends Error{constructor(status,message=status){super(message);this.status=status;}}
  const plain=v=>v!==null&&typeof v==="object"&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
  const errorText=e=>{try{return String(e?.message??e);}catch{return"Unknown error";}};
  function freeze(value,seen=new WeakSet()){
    if(value&&typeof value==="object"&&!seen.has(value)){seen.add(value);for(const child of Object.values(value))freeze(child,seen);Object.freeze(value);}return value;
  }
  const immutable=value=>freeze(structuredClone(value));
  function abortable(promise,signal){
    return new Promise((resolve,reject)=>{
      const cleanup=()=>signal.removeEventListener("abort",abort);
      const abort=()=>{cleanup();reject(signal.reason??new Stop("aborted"));};
      signal.addEventListener("abort",abort,{once:true});
      Promise.resolve(promise).then(v=>{cleanup();resolve(v);},e=>{cleanup();reject(e);});
      if(signal.aborted)abort();
    });
  }
  function checkedAction(value){
    const schemas={list_files:[],read_file:["path"],search:["query"],replace_text:["path","oldText","newText"],write_file:["path","content"],rename_identifier:["path","oldName","newName"],finish:["answer"]};
    if(!plain(value)||typeof value.type!=="string"||!Object.hasOwn(schemas,value.type))throw new Stop("protocol_error","Unknown or malformed action");
    const fields=schemas[value.type],keys=Object.keys(value);
    if(keys.length!==fields.length+1||keys.some(k=>k!=="type"&&!fields.includes(k)))throw new Stop("protocol_error","Missing or additional action fields");
    for(const field of fields){const item=value[field];if(!(field==="expectedVersion"?Number.isSafeInteger(item)&&item>0:typeof item==="string"))throw new Stop("protocol_error","Invalid action field: "+field);}
    return structuredClone(value);
  }
  function addUsage(total,value){
    if(value===undefined)return{};
    if(!plain(value)||Object.values(value).some(n=>typeof n!=="number"||!Number.isFinite(n)||n<0))throw new Stop("protocol_error","Malformed usage");
    for(const[key,amount]of Object.entries(value)){
      const sum=(Object.hasOwn(total,key)?total[key]:0)+amount;if(!Number.isFinite(sum))throw new Stop("protocol_error","Usage overflow");
      Object.defineProperty(total,key,{value:sum,enumerable:true,configurable:true,writable:true});
    }return structuredClone(value);
  }
  async function runEngineTask({task,adapter,evaluate,signal,workspaceLimits,onEvent,contextReuse=false,native=false}){
    const started=performance.now(),controller=new AbortController(),events=[],usage={},messages=[],observerErrors=[];
    let observing=true,timer,workspace,deadline=Infinity,status="max_turns",valid=true,invalidReason;
    const observed=new Map();let edits=0,contract,rawAnswer="";
    let turns=0,answer="",snapshot={},manifest={},accepted=false,checks=[],gradingElapsedMs=0;
    const observerError=(eventSeq,error)=>{if(observing)observerErrors.push({eventSeq,atMs:performance.now()-started,message:errorText(error)});};
    const emit=(type,detail={})=>{
      const event=immutable({seq:events.length,atMs:performance.now()-started,type,...detail});events.push(event);
      if(typeof onEvent==="function"){try{const pending=onEvent(event);if(pending&&typeof pending.then==="function")Promise.resolve(pending).catch(e=>observerError(event.seq,e));}catch(e){observerError(event.seq,e);}}
    };
    const parentAbort=()=>controller.abort(new Stop("aborted"));
    const gate=()=>{if(controller.signal.aborted)throw controller.signal.reason;if(performance.now()>=deadline){controller.abort(new Stop("deadline"));throw controller.signal.reason;}};
    try{
      const maxTurns=task?.maxTurns??12,deadlineMs=task?.deadlineMs??60000;
      if(!task||typeof task.id!=="string"||typeof task.prompt!=="string"||!Number.isSafeInteger(maxTurns)||maxTurns<1||!Number.isFinite(deadlineMs)||deadlineMs<=0||deadlineMs>2147483647||(task.initialContext!==undefined&&typeof task.initialContext!=="string")){
        valid=false;throw new Stop("invalid_config","Invalid task configuration");
      }
      deadline=started+deadlineMs;signal?.addEventListener("abort",parentAbort,{once:true});if(signal?.aborted)parentAbort();gate();
      timer=setTimeout(()=>controller.abort(new Stop("deadline")),Math.max(0,deadline-performance.now()));
      workspace=createWorkspace(task.files,workspaceLimits);contract=compileContract(task);gate();
      messages.push({role:"user",content:task.prompt+"\n\nAvailable files:\n"+JSON.stringify([...workspace.list()].sort())+(task.initialContext===undefined?"":"\n\nInitial context:\n"+task.initialContext)});
      if(contextReuse){
        const paths=workspace.list(),named=paths.filter(path=>task.prompt.includes(path));
        const selected=named.length?named:(paths.length<=3?paths:[]);
        const initial=[];let contextBytes=0;
        for(const path of selected){
          const file=workspace.read(path),size=Buffer.byteLength(file.content,"utf8");
          if(contextBytes+size>8192)continue;
          initial.push(file);contextBytes+=size;
        }
        for(const file of initial)observed.set(file.path,file.version);
        if(initial.length)messages[0].content+="\nCurrent observed files:\n"+JSON.stringify(initial);
        emit("context_reuse",{files:initial.map(({path,version})=>({path,version}))});
      }
      if(!adapter||typeof adapter.next!=="function")throw new Stop("adapter_error","Adapter has no next method");
      while(turns<maxTurns){
        gate();turns++;emit("model_request",{turn:turns});let response;
        try{
          response=await abortable(Promise.resolve().then(()=>{gate();return adapter.next({task:freeze({id:task.id,prompt:task.prompt}),messages:immutable(messages),signal:controller.signal,turn:turns});}),controller.signal);
        }catch(e){if(e instanceof Stop)throw e;throw new Stop("adapter_error",errorText(e));}
        gate();if(!plain(response))throw new Stop("protocol_error","Malformed adapter response");
        const action=checkedAction(response.action),reportedUsage=addUsage(usage,response.usage);
        emit("model_response",{turn:turns,action,usage:reportedUsage});
        messages.push({role:"assistant",content:JSON.stringify(action)});
        if(action.type==="finish"){
          gate();rawAnswer=action.answer;
          try{
            answer=finishContract(contract,{workspace,observed,answer:rawAnswer,edits});
            status="finished";emit("formatted_submission",{rawAnswer,answer,contract:contract.kind});break;
          }catch(e){
            const reply={ok:false,error:{message:errorText(e)}};
            messages.push({role:"user",content:JSON.stringify(reply)+"\nOriginal request: "+task.prompt});
            emit("tool_result",{turn:turns,action:action.type,reply});continue;
          }
        }
        let reply;
        try{
          gate();let result;
          switch(action.type){
            case"list_files":result=workspace.list();break;
            case"read_file":result=workspace.read(action.path);observed.set(result.path,result.version);break;
            case"search":result=workspace.search(action.query);break;
            case"replace_text":
            case"write_file":{
              if(contract.readOnly)throw new Error("READ_ONLY: editing is not authorized by this task");
              const current=workspace.read(action.path);
              if(observed.get(current.path)!==current.version)throw new Error("READ_REQUIRED: "+current.path);
              let content=action.content;
              if(action.type==="replace_text"){
                if(!action.oldText)throw new Error("INVALID_REPLACEMENT: oldText must not be empty");
                const offset=current.content.indexOf(action.oldText);
                if(offset<0)throw new Error("TEXT_NOT_FOUND: read the current content");
                if(current.content.indexOf(action.oldText,offset+1)>=0)throw new Error("AMBIGUOUS_REPLACEMENT: use more surrounding text");
                content=current.content.slice(0,offset)+action.newText+current.content.slice(offset+action.oldText.length);
              }
              [result]=workspace.applyChanges([{path:current.path,expectedVersion:observed.get(current.path),content}]);
              observed.set(result.path,result.version);edits++;break;
            }
            case"rename_identifier":{
              if(!native)throw new Error("UNAVAILABLE_TOOL");
              if(contract.readOnly)throw new Error("READ_ONLY");
              const {proposeRename}=await import("./native-edits.mjs");
              const proposal=proposeRename(workspace.snapshot(),{path:action.path,oldName:action.oldName,newName:action.newName});
              const changes=proposal.changes.map(change=>{
                const current=workspace.read(change.path);
                if(observed.get(current.path)!==current.version)throw new Error("READ_REQUIRED: "+current.path);
                return {...change,expectedVersion:observed.get(current.path)};
              });
              gate();result=workspace.applyChanges(changes);
              for(const file of result)observed.set(file.path,file.version);
              edits+=result.length;break;
            }
          }
          gate();reply={ok:true,result};
        }catch(e){if(e instanceof Stop)throw e;reply={ok:false,error:{message:errorText(e)}};}
        messages.push({role:"user",content:JSON.stringify(reply)+"\nOriginal request: "+task.prompt});emit("tool_result",{turn:turns,action:action.type,reply});
      }gate();
    }catch(e){status=e instanceof Stop?e.status:"workspace_error";if(!(e instanceof Stop))valid=false;if(!valid)invalidReason=errorText(e);emit("execution_error",{status,message:errorText(e)});}
    finally{
      try{snapshot=immutable(workspace?workspace.snapshot():{});manifest=immutable(workspace?workspace.manifest():{});if(status==="finished")gate();}
      catch(e){if(e instanceof Stop)status=e.status;else{valid=false;status="workspace_error";invalidReason=errorText(e);}}
      clearTimeout(timer);signal?.removeEventListener("abort",parentAbort);
    }
    emit("submission",{status,turns,provisional:status==="finished"});
    const executionEvents=immutable(events),executionUsage=immutable(usage);
    if(status==="finished"){try{gate();}catch(e){status=e.status;}}
    const elapsedMs=performance.now()-started,submissionStatus=status;
    if(valid&&status==="finished"){
      const gradingStarted=performance.now(),gradingController=new AbortController();
      const gradingTimer=setTimeout(()=>gradingController.abort(new Stop("evaluator_timeout")),20000);
      try{
        const result=await abortable(Promise.resolve().then(()=>evaluate({snapshot,answer},{signal:gradingController.signal})),gradingController.signal);
        if(performance.now()-gradingStarted>=20000)throw new Stop("evaluator_timeout");
        if(!plain(result)||typeof result.accepted!=="boolean"||!Object.hasOwn(result,"checks"))throw new Error("Malformed evaluator result");
        checks=immutable(result.checks);accepted=result.accepted;
      }catch(e){valid=false;status=e instanceof Stop?e.status:"evaluator_error";invalidReason=errorText(e);}
      finally{clearTimeout(gradingTimer);gradingElapsedMs=performance.now()-gradingStarted;}
    }
    observing=false;
    return freeze({taskId:task?.id??null,valid,accepted,elapsedMs,status,...(invalidReason===undefined?{}:{invalidReason}),answer,rawAnswer,edits,snapshot,manifest,events:executionEvents,usage:executionUsage,turns,adapterKind:adapter?.kind??null,checks,submissionStatus,gradingElapsedMs,observerErrors:immutable(observerErrors)});
  }

export { runEngineTask };
