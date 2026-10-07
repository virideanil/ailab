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
  return {kind:"free",paths:named.length?named:(readOnly?Object.keys(task.files):[]),readOnly,format:compileAnswerFormat(prompt)};
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
  const rendered=typeof answer==="string"?answer.trim():answer;
  if(contract.format&&!validAnswer(contract.format,rendered))throw new Error("FORMAT_REQUIRED: "+JSON.stringify(contract.format));
  return contract.format?rendered:answer;
}
const token=/^[A-Za-z0-9_-]+$/;
const integer=/^-?(?:0|[1-9][0-9]*)$/;
export function compileAnswerFormat(prompt){
  const offset=prompt.search(/\bOutput\b/i);if(offset<0)return null;
  const output=prompt.slice(offset).split(/Do not (?:modify|edit)/i)[0];
  const unknown=/\bUNKNOWN\b/.test(output);
  const tuple=output.match(/Output exactly ([A-Z][A-Z_]*(?:\|[A-Z][A-Z_]*)+)(?: or ([A-Z][A-Z_]*(?:\|[A-Z][A-Z_]*)+))?/);
  if(tuple)return {kind:"oneOf",formats:[...tuple.slice(1).filter(Boolean).map(form=>({kind:"tuple",fields:form.split("|").map(field=>field.endsWith("_ID")?{kind:"token"}:field.endsWith("_CENTS")?{kind:"integer"}:{kind:"enum",values:[field]})})),...(unknown?[{kind:"enum",values:["UNKNOWN"]}]:[])]};
  if(/Output (?:only )?(?:the )?integer\b/i.test(output))return {kind:"oneOf",formats:[{kind:"integer"},...(unknown?[{kind:"enum",values:["UNKNOWN"]}]:[])]};
  if(/Output only YYYY-MM-DD/.test(output))return {kind:"date"};
  const values=[...output.matchAll(/\b([A-Z][A-Z_]+)\s+(?:if|when)\b/g)].map(m=>m[1]);
  for(const m of output.matchAll(/\botherwise ([A-Z][A-Z_]+)\b/g))values.push(m[1]);
  if(/^Output [A-Z][A-Z_]+ (?:if|when)\b/.test(output)&&values.length)return {kind:"enum",values:[...new Set(values)]};
  if(/Output (?:only )?(?:(?:the|that) .*? ID|that token)\b/i.test(output))return {kind:"token"};
  return null;
}
export function validAnswer(format,value){
  if(typeof value!=="string")return false;
  switch(format.kind){
    case "oneOf":return format.formats.some(f=>validAnswer(f,value));
    case "token":return token.test(value);
    case "integer":return integer.test(value);
    case "enum":return format.values.includes(value);
    case "tuple":{const fields=value.split("|");return fields.length===format.fields.length&&fields.every((field,i)=>validAnswer(format.fields[i],field));}
    case "date":{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+"T00:00:00Z");return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value;}
    default:throw Error("Unknown public answer format");
  }
}

