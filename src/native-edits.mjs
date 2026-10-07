import ts from "typescript";
import {posix} from "node:path";
const ROOT="/__kovan__/",LIB=ROOT+"__native_intrinsics__.d.ts";
const EXTENSIONS=new Map([[".mjs",ts.Extension.Mjs],[".js",ts.Extension.Js],[".mts",ts.Extension.Mts],[".ts",ts.Extension.Ts]]);
const INTRINSICS=[
 "interface Object {}","interface Function {}","interface CallableFunction extends Function {}","interface NewableFunction extends Function {}",
 "interface IArguments {length:number;[n:number]:any;callee:Function;}",
 "interface String {readonly length:number;trim():string;toLowerCase():string;replace(search:string|RegExp,replacement:string):string;split(separator:string):string[];}",
 "interface Number {}","interface Boolean {}","interface RegExp {}",
 "interface Array<T> {length:number;[n:number]:T;slice(start?:number,end?:number):T[];map<U>(fn:(value:T,index:number,array:T[])=>U):U[];filter(fn:(value:T,index:number,array:T[])=>unknown):T[];sort(compare?:(a:T,b:T)=>number):this;join(separator?:string):string;}",
 "interface ReadonlyArray<T> {readonly length:number;readonly [n:number]:T;slice(start?:number,end?:number):T[];map<U>(fn:(value:T,index:number,array:readonly T[])=>U):U[];filter(fn:(value:T,index:number,array:readonly T[])=>unknown):T[];join(separator?:string):string;}",
 "type PropertyKey=string|number|symbol;","declare const String:{(value?:any):string};",
 "declare const Object:{hasOwn(value:object,key:PropertyKey):boolean};","declare const Math:{min(...values:number[]):number};"
].join("\n");
const OPTIONS=Object.freeze({target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,moduleDetection:ts.ModuleDetectionKind.Force,allowJs:true,checkJs:true,noEmit:true,noLib:true,types:[],allowImportingTsExtensions:true});
const PREFERENCES=Object.freeze({providePrefixAndSuffixTextForRename:true});
const MEANING=ts.SymbolFlags.Value|ts.SymbolFlags.Type|ts.SymbolFlags.Namespace;
function refuse(reason){throw Object.assign(new Error("Native rename refused: "+reason),{code:"NATIVE_RENAME_REFUSED"});}
function record(value,label){
 if(!value||![Object.prototype,null].includes(Object.getPrototypeOf(value))||Object.getOwnPropertySymbols(value).length)refuse(label+" must be a plain record");
 return Object.entries(Object.getOwnPropertyDescriptors(value)).map(([key,d])=>{if(!Object.hasOwn(d,"value")||!d.enumerable)refuse(label+" must contain data properties");return [key,d.value];});
}
function relativePath(path){
 if(typeof path!=="string"||!path||path.startsWith("/")||path.includes("\\")||path.includes("\0")||/^[a-z]:/i.test(path)||path.split("/").some(p=>!p||p==="."||p==="..")||Buffer.byteLength(path)>1024)refuse("canonical relative POSIX path required");
 return path;
}
function identifier(name){
 if(typeof name!=="string"||!ts.isIdentifierText(name,ts.ScriptTarget.Latest))return false;
 const scanner=ts.createScanner(ts.ScriptTarget.Latest,false,ts.LanguageVariant.Standard,name);
 return scanner.scan()===ts.SyntaxKind.Identifier&&scanner.getTokenText()===name&&scanner.scan()===ts.SyntaxKind.EndOfFileToken;
}
function scriptKind(path){return /\.(?:mjs|js)$/.test(path)?ts.ScriptKind.JS:ts.ScriptKind.TS;}
function prepare(snapshot){
 const entries=record(snapshot,"snapshot");if(!entries.length||entries.length>128)refuse("snapshot file-count limit");
 const files=new Map();let total=0;
 for(const [path,content] of entries){
  relativePath(path);if(typeof content!=="string")refuse("snapshot contents must be strings");
  const size=Buffer.byteLength(content);total+=size;if(size>65536||total>1048576)refuse("snapshot byte limit");
  if(path==="__native_intrinsics__.d.ts")refuse("reserved path");
  if(!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(path))continue;
  if(!EXTENSIONS.has(posix.extname(path))||/\.d\.[cm]?ts$/.test(path))refuse("unsupported source type: "+path);
  const name=ROOT+path,parsed=ts.createSourceFile(name,content,ts.ScriptTarget.ES2022,true,scriptKind(name));
  if(!ts.isExternalModule(parsed)&&!/\.(?:mjs|mts)$/.test(path))refuse("ES modules only");
  if(parsed.referencedFiles.length||parsed.typeReferenceDirectives.length||parsed.libReferenceDirectives.length)refuse("reference directives are unsupported");
  const scanner=ts.createScanner(ts.ScriptTarget.Latest,false,ts.LanguageVariant.Standard,content);
  for(let token=scanner.scan();token!==ts.SyntaxKind.EndOfFileToken;token=scanner.scan())
   if((token===ts.SyntaxKind.SingleLineCommentTrivia||token===ts.SyntaxKind.MultiLineCommentTrivia)&&/@ts-(?:ignore|expect-error|nocheck)\b/.test(scanner.getTokenText()))refuse("suppressed diagnostics");
  files.set(name,content);
 }
 if(!files.size)refuse("no supported source files");return files;
}
function project(sourceFiles){
 const files=new Map(sourceFiles);files.set(LIB,INTRINSICS);
 const directories=new Set([ROOT.slice(0,-1)]);
 for(const file of files.keys())for(let dir=posix.dirname(file);dir.startsWith(ROOT.slice(0,-1));dir=posix.dirname(dir)){directories.add(dir);if(dir===ROOT.slice(0,-1))break;}
 function resolve(specifier,containingFile){
  if(!/^\.{1,2}\//.test(specifier)||/[\\\0?#]/.test(specifier))return undefined;
  const base=posix.resolve(posix.dirname(containingFile),specifier);if(!base.startsWith(ROOT))return undefined;
  let candidates;
  if(base.endsWith(".mjs"))candidates=[base.slice(0,-4)+".mts",base];
  else if(base.endsWith(".js"))candidates=[base.slice(0,-3)+".ts",base];
  else if(EXTENSIONS.has(posix.extname(base)))candidates=[base];
  else if(posix.extname(base))return undefined;
  else candidates=[...EXTENSIONS.keys()].flatMap(ext=>[base+ext,base+"/index"+ext]);
  const matches=candidates.filter(file=>sourceFiles.has(file));if(matches.length>1)refuse("ambiguous relative import");
  const resolvedFileName=matches[0];
  return resolvedFileName?{resolvedFileName,extension:EXTENSIONS.get(posix.extname(resolvedFileName)),isExternalLibraryImport:false}:undefined;
 }
 const host={
  getCompilationSettings:()=>OPTIONS,getScriptFileNames:()=>[...files.keys()],getScriptVersion:()=>"1",getScriptKind:scriptKind,
  getScriptSnapshot:file=>files.has(file)?ts.ScriptSnapshot.fromString(files.get(file)):undefined,
  getCurrentDirectory:()=>ROOT.slice(0,-1),getDefaultLibFileName:()=>LIB,getDefaultLibLocation:()=>ROOT.slice(0,-1),
  useCaseSensitiveFileNames:()=>true,getNewLine:()=>"\n",readFile:file=>files.get(file),fileExists:file=>files.has(file),
  directoryExists:dir=>directories.has(dir.replace(/\/$/,"")),getDirectories:()=>[],readDirectory:()=>[],realpath:file=>file,writeFile:()=>refuse("emission is unsupported"),
  resolveModuleNameLiterals:(literals,containingFile)=>literals.map(literal=>({resolvedModule:resolve(literal.text,containingFile)})),
  resolveTypeReferenceDirectiveReferences:references=>references.map(()=>({resolvedTypeReferenceDirective:undefined}))
 };
 return ts.createLanguageService(host,ts.createDocumentRegistry(true,ROOT.slice(0,-1)));
}
function diagnostics(service,files){
 const all=service.getCompilerOptionsDiagnostics();
 for(const path of [...files.keys(),LIB])all.push(...service.getSyntacticDiagnostics(path),...service.getSemanticDiagnostics(path));
 if(all.length){const first=all[0];refuse("TS"+first.code+": "+ts.flattenDiagnosticMessageText(first.messageText," ").slice(0,240));}
}
function binding(sourceFile,name){
 const found=[];
 function collect(node,supported){
  if(ts.isIdentifier(node)){if(node.text===name)found.push({node,supported});}
  else if(ts.isObjectBindingPattern(node)||ts.isArrayBindingPattern(node))for(const element of node.elements)if(ts.isBindingElement(element))collect(element.name,false);
 }
 for(const statement of sourceFile.statements){
  if(ts.isVariableStatement(statement))for(const declaration of statement.declarationList.declarations)collect(declaration.name,true);
  else if(ts.isFunctionDeclaration(statement)||ts.isClassDeclaration(statement)){if(statement.name)collect(statement.name,!statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.DeclareKeyword));}
  else if(ts.isImportDeclaration(statement)){
   const clause=statement.importClause;if(clause?.name)collect(clause.name,false);
   if(clause?.namedBindings){if(ts.isNamespaceImport(clause.namedBindings))collect(clause.namedBindings.name,false);else for(const item of clause.namedBindings.elements)collect(item.name,false);}
  }else if(statement.name&&ts.isIdentifier(statement.name))collect(statement.name,false);
 }
 if(found.length!==1)refuse("expected one top-level binding");if(!found[0].supported)refuse("unsupported binding");return found[0].node;
}
function identifierAt(sourceFile,start,length){
 function visit(node){
  if(ts.isIdentifier(node)&&node.getStart(sourceFile)===start&&node.end===start+length)return node;
  return ts.forEachChild(node,child=>child.pos<=start&&child.end>=start+length?visit(child):undefined);
 }
 return visit(sourceFile);
}
// Pure proposal over a detached snapshot; the host checks observed versions and commits atomically.
export function proposeRename(snapshot,options){
 if(ts.version!=="5.9.3")refuse("requires TypeScript 5.9.3");
 const args=Object.fromEntries(record(options,"rename options"));
 if(Object.keys(args).length!==3||Object.keys(args).some(k=>!["path","oldName","newName"].includes(k)))refuse("expected path, oldName and newName");
 const path=relativePath(args.path),{oldName,newName}=args;
 if(!identifier(oldName)||!identifier(newName)||oldName===newName)refuse("invalid or unchanged identifier");
 const files=prepare(snapshot),fileName=ROOT+path;if(!files.has(fileName))refuse("requested source file is unavailable");
 const service=project(files);
 try{
  diagnostics(service,files);
  const program=service.getProgram(),sourceFile=program?.getSourceFile(fileName);if(!sourceFile)refuse("source unavailable");
  const selected=binding(sourceFile,oldName),position=selected.getStart(sourceFile);
  const info=service.getRenameInfo(fileName,position,PREFERENCES);if(!info.canRename||info.fileToRename)refuse("binding cannot be renamed");
  const locations=service.findRenameLocations(fileName,position,false,false,PREFERENCES);if(!locations?.length)refuse("no semantic rename locations");
  const checker=program.getTypeChecker(),edits=new Map(),seen=new Set();let includesDeclaration=false;
  for(const location of locations){
   const {fileName:target,textSpan}=location,content=files.get(target),file=program.getSourceFile(target),{start,length}=textSpan;
   if(!file||content===undefined||!Number.isSafeInteger(start)||!Number.isSafeInteger(length)||start<0||length<1||start+length>content.length||content.slice(start,start+length)!==oldName)refuse("unsupported rename span");
   const node=identifierAt(file,start,length);if(!node)refuse("non-identifier rename location");
   if(checker.resolveName(newName,node,MEANING,false))refuse("new name would collide or capture a reference");
   const key=target+":"+start+":"+length;if(seen.has(key))refuse("duplicate rename location");seen.add(key);
   if(target===fileName&&start===position)includesDeclaration=true;
   for(const part of [location.prefixText,location.suffixText])if(part!==undefined&&typeof part!=="string")refuse("invalid rename affix");
   const replacement=(location.prefixText??"")+newName+(location.suffixText??"");
   if(!edits.has(target))edits.set(target,[]);edits.get(target).push({start,length,replacement});
  }
  if(!includesDeclaration)refuse("declaration missing from rename");
  const updated=new Map(files),changes=[];
  for(const [target,spans] of [...edits].sort(([a],[b])=>a.localeCompare(b))){
   spans.sort((a,b)=>b.start-a.start);let content=files.get(target),boundary=content.length;
   for(const span of spans){if(span.start+span.length>boundary)refuse("overlapping rename spans");content=content.slice(0,span.start)+span.replacement+content.slice(span.start+span.length);boundary=span.start;}
   if(Buffer.byteLength(content)>65536)refuse("replacement byte limit");
   updated.set(target,content);changes.push({path:target.slice(ROOT.length),content});
  }
  const after=project(updated);try{diagnostics(after,updated);}finally{after.dispose();}
  return {changes,locations:seen.size};
 }catch(error){if(error?.code==="NATIVE_RENAME_REFUSED")throw error;refuse("TypeScript could not produce a safe proposal");}finally{service.dispose();}
}
