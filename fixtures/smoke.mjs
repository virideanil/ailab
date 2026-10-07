
  // Harness smoke only: explicit transformations, not general coding capability.
  const read=path=>({type:"read_file",path});
  const replace=(path,oldText,newText)=>({type:"replace_text",path,oldText,newText,expectedVersion:1});
  function make({id,prompt,files,expected,script,answer="done"}){
    const sentinel={"unrelated.txt":"Preserve this unrelated file exactly.\n"};
    const publicFiles=Object.freeze({...files,...sentinel}),gold=Object.freeze({...expected,...sentinel});
    const task=Object.freeze({id,prompt,files:publicFiles,maxTurns:12,deadlineMs:120000});
    return{task,script:[...script,{type:"finish",answer}],evaluate({snapshot,answer:actualAnswer}){
      const actual=snapshot??{},paths=Object.keys(gold).sort();
      const checks=[
        {name:"exact file inventory",passed:JSON.stringify(Object.keys(actual).sort())===JSON.stringify(paths)},
        {name:"exact file contents",passed:paths.every(p=>actual[p]===gold[p])},
        {name:"exact final answer",passed:actualAnswer===answer}];
      return{accepted:checks.every(c=>c.passed),checks};
    }};
  }
  const done="\nPreserve every other byte and file. Finish with exactly: done.";
  const single=(id,path,prompt,content,oldText,newText)=>make({
    id,prompt:prompt+done,files:{[path]:content},
    expected:{[path]:content.replace(oldText,newText)},
    script:[read(path),replace(path,oldText,newText)]
  });
  const fixtures=[
    single("smoke-ttl-boundary","src/cache.js",
      "In src/cache.js, change exactly `return now > entry.expiresAt;` to `return now >= entry.expiresAt;` so expiration includes equality.",
      "export function expired(entry, now) {\n  return now > entry.expiresAt;\n}\n",
      "return now > entry.expiresAt;","return now >= entry.expiresAt;"),
    single("smoke-preserve-zero","src/options.js",
      "In src/options.js, replace exactly `const limit = options.limit || 10;` with `const limit = options.limit ?? 10;` so zero remains a valid limit.",
      "export function getLimit(options) {\n  const limit = options.limit || 10;\n  return limit;\n}\n",
      "const limit = options.limit || 10;","const limit = options.limit ?? 10;"),
    single("smoke-empty-guard","src/mean.js",
      "In src/mean.js, insert exactly `  if (values.length === 0) return null;` as the first line inside mean, followed by a newline.",
      "export function mean(values) {\n  return values.reduce((sum, value) => sum + value, 0) / values.length;\n}\n",
      "export function mean(values) {\n","export function mean(values) {\n  if (values.length === 0) return null;\n"),
    make({id:"smoke-two-file-rename",
      prompt:"Rename retryDelay to backoffDelay in the export in src/retry.js and in both the import and call in src/main.js. Keep all other text unchanged."+done,
      files:{"src/retry.js":"export function retryDelay(attempt) {\n  return attempt * 100;\n}\n","src/main.js":'import { retryDelay } from "./retry.js";\nexport const delay = retryDelay(2);\n'},
      expected:{"src/retry.js":"export function backoffDelay(attempt) {\n  return attempt * 100;\n}\n","src/main.js":'import { backoffDelay } from "./retry.js";\nexport const delay = backoffDelay(2);\n'},
      script:[read("src/retry.js"),read("src/main.js"),replace("src/retry.js","export function retryDelay(attempt)","export function backoffDelay(attempt)"),replace("src/main.js",'import { retryDelay } from "./retry.js";\nexport const delay = retryDelay(2);\n','import { backoffDelay } from "./retry.js";\nexport const delay = backoffDelay(2);\n')]
    }),
    single("smoke-config-change","config.json",
      'In config.json, change exactly `"timeoutMs": 3000` to `"timeoutMs": 5000`. Preserve formatting, retries, and enabled.',
      '{\n  "timeoutMs": 3000,\n  "retries": 2,\n  "enabled": true\n}\n',
      '"timeoutMs": 3000','"timeoutMs": 5000'),
    single("smoke-copy-before-sort","src/sort.js",
      "In src/sort.js, replace exactly `return values.sort((a, b) => a - b);` with `return [...values].sort((a, b) => a - b);` to preserve the input array.",
      "export function ascending(values) {\n  return values.sort((a, b) => a - b);\n}\n",
      "return values.sort((a, b) => a - b);","return [...values].sort((a, b) => a - b);"),
    make({id:"smoke-grounded-answer",
      prompt:"Read notes/release.txt. Report its version and status using exactly `version=<version>;status=<status>` with no whitespace or extra text. Do not edit any files.",
      files:{"notes/release.txt":"Product: Comet\nVersion: 2.4.1\nStatus: paused\nOwner: Ada\n"},
      expected:{"notes/release.txt":"Product: Comet\nVersion: 2.4.1\nStatus: paused\nOwner: Ada\n"},
      script:[read("notes/release.txt")],answer:"version=2.4.1;status=paused"}),
    make({id:"smoke-missing-information",
      prompt:"Read notes/project.txt and report the launch date as YYYY-MM-DD. Use only that file as evidence. If it does not state a launch date, answer exactly UNKNOWN. No extra text and no file edits.",
      files:{"notes/project.txt":"Project: Comet\nOwner: Ada\nStatus: testing\n"},
      expected:{"notes/project.txt":"Project: Comet\nOwner: Ada\nStatus: testing\n"},
      script:[read("notes/project.txt")],answer:"UNKNOWN"})
  ];

export { fixtures };
