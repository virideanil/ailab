// Public output constraints only. This module never imports fixtures or grading.
export function compileContract(task) {
  const prompt=task.prompt;
  const named=Object.keys(task.files).filter(path=>prompt.includes(path));
  const literal=prompt.match(/Finish with exactly:\s*([^\n.]+)\.?$/i);
  if(task.outputContract?.kind==="literal")return {kind:"literal",value:task.outputContract.value,requiresEdit:task.stratum==="coding"};
  if(literal)return {kind:"literal",value:literal[1].trim(),requiresEdit:true};
  // Bounded extraction for explicit key/value templates; arbitrary prose remains model reasoning.
  const template=prompt.match(/using exactly \x60([^\x60]*<[a-zA-Z ]+>[^\x60]*)\x60/i);
  if(template&&named.length===1)return {kind:"fields",template:template[1],paths:named,readOnly:true};
  const date=prompt.match(/report (?:the )?([a-zA-Z ]+) as YYYY-MM-DD/i);
  if(date&&named.length===1&&/answer exactly UNKNOWN/i.test(prompt))
    return {kind:"date",field:date[1].trim(),paths:named,readOnly:true};
  const readOnly=/Do not (?:edit|modify) any files|no file edits/i.test(prompt);
  // An evidence question without named paths refers to its supplied document set.
  // Require observation before accepting even an abstention; no grading data is consulted.
  return {kind:"free",paths:named.length?named:(readOnly?Object.keys(task.files):[]),readOnly};
}
const key=value=>value.toLowerCase().replace(/[^a-z0-9]/g,"");
function extract(content,field){
  const values=content.split(/\r?\n/).map(line=>line.match(/^([^:]+):\s*(.*?)\s*$/))
    .filter(match=>match&&key(match[1])===key(field)).map(match=>match[2]).filter(Boolean);
  const unique=[...new Set(values)];return unique.length===1?unique[0]:null;
}
export function finishContract(contract,{workspace,observed,answer,edits}){
  if(contract.requiresEdit&&!edits)throw new Error("NO_EDIT: propose and apply a real change before finishing");
  if(contract.readOnly&&edits)throw new Error("READ_ONLY: this question does not authorize edits");
  for(const path of contract.paths??[]){
    if(observed.get(path)!==workspace.read(path).version)throw new Error("READ_REQUIRED: "+path);
  }
  if(contract.kind==="literal")return contract.value;
  if(contract.kind==="fields"){
    const content=workspace.read(contract.paths[0]).content;let missing=false;
    const result=contract.template.replace(/<([a-zA-Z ]+)>/g,(_,field)=>{
      const value=extract(content,field);if(value===null)missing=true;return value??"UNKNOWN";
    });
    return missing?"UNKNOWN":result;
  }
  if(contract.kind==="date"){
    const value=extract(workspace.read(contract.paths[0]).content,contract.field);
    if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return "UNKNOWN";
    const parsed=new Date(value+"T00:00:00Z");
    return Number.isFinite(+parsed)&&parsed.toISOString().slice(0,10)===value?value:"UNKNOWN";
  }
  return answer;
}
