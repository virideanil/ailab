// Validate complete JSON and reject duplicate members, including escaped aliases.
export function parseUniqueJson(source){
 if(typeof source!=="string"||source.length>262144)throw Error("Invalid JSON size");
 const value=JSON.parse(source);
 const tokens=source.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g)??[];
 let at=0;
 function walk(depth){
  if(depth>32)throw Error("JSON nesting limit");
  const first=tokens[at++];
  if(first==="{"){
   const keys=new Set();if(tokens[at]==="}"){at++;return;}
   for(;;){const key=JSON.parse(tokens[at++]);if(keys.has(key))throw Error("Duplicate JSON member");keys.add(key);at++;walk(depth+1);if(tokens[at++]==="}")break;}
  }else if(first==="["){
   if(tokens[at]==="]"){at++;return;}
   for(;;){walk(depth+1);if(tokens[at++]==="]")break;}
  }
 }
 walk(0);if(at!==tokens.length)throw Error("Invalid JSON token sequence");
 return value;
}
export function parseProposalEnvelope(content){
 if(typeof content!=="string")throw Error("Missing proposal content");
 let source=content.trim(),mode="json-object";
 if(source.startsWith("```")){
  const match=source.match(/^```json[ \t]*\r?\n([\s\S]*?)\r?\n```$/);
  if(!match)throw Error("Invalid JSON fence");
  source=match[1];mode="json-fence";
 }
 const envelope=parseUniqueJson(source);
 if(!envelope||Array.isArray(envelope)||typeof envelope!=="object"||Object.keys(envelope).sort().join(",")!=="arguments,name"||typeof envelope.name!=="string"||!envelope.arguments||typeof envelope.arguments!=="object"||Array.isArray(envelope.arguments))throw Error("Invalid proposal envelope");
 return {envelope,mode};
}
