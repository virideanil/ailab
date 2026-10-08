import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { isDeepStrictEqual } from "node:util";

function makeJsonCodec(maxBytes = 1048576) {
  const array = Array.isArray, own = Object.hasOwn, keys = Reflect.ownKeys;
  const descriptor = Object.getOwnPropertyDescriptor, prototype = Object.getPrototypeOf;
  const objectPrototype = Object.prototype, finite = Number.isFinite;
  const quote = JSON.stringify.bind(JSON), byteLength = Buffer.byteLength.bind(Buffer);
  const ErrorType = TypeError;
  return value => {
    const ancestors = []; let nodes = 0;
    function visit(v, depth) {
      if (++nodes > 50000 || depth > 32) throw new ErrorType("JSON complexity limit");
      if (v === null || typeof v === "boolean" || typeof v === "string") return quote(v);
      if (typeof v === "number" && finite(v)) return quote(v);
      if (typeof v !== "object" || v === null) throw new ErrorType("Non-JSON value");
      for (let i = 0; i < ancestors.length; i++)
        if (ancestors[i] === v) throw new ErrorType("Cyclic JSON");
      const isArray = array(v), names = keys(v);
      if (!isArray && prototype(v) !== objectPrototype && prototype(v) !== null)
        throw new ErrorType("JSON objects must be plain");
      ancestors[ancestors.length] = v;
      let text = isArray ? "[" : "{";
      if (isArray) {
        const length = descriptor(v, "length").value;
        if (length > 50000 || names.length !== length + 1) throw new ErrorType("Invalid JSON array");
        for (let i = 0; i < length; i++) {
          const d = descriptor(v, String(i));
          if (!d || !own(d, "value") || !d.enumerable) throw new ErrorType("Sparse/accessor array");
          text += (i ? "," : "") + visit(d.value, depth + 1);
        }
      } else {
        for (let i = 0; i < names.length; i++) {
          const name = names[i], d = descriptor(v, name);
          if (typeof name !== "string" || !own(d, "value") || !d.enumerable)
            throw new ErrorType("Invalid JSON property");
          text += (i ? "," : "") + quote(name) + ":" + visit(d.value, depth + 1);
        }
      }
      ancestors.length--;
      return text + (isArray ? "]" : "}");
    }
    const result = visit(value, 0);
    if (byteLength(result, "utf8") > maxBytes) throw new ErrorType("JSON byte limit");
    return result;
  };
}
function jsonText(value) { return encodeJson(value); }
function jsonEqual(a, b) {
  return isDeepStrictEqual(JSON.parse(encodeJson(a)), JSON.parse(encodeJson(b)));
}
function recordEntries(value, label) {
  if (value === null || typeof value !== "object" ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new TypeError(label + " must be a plain record");
  return Reflect.ownKeys(value).map(key => {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !Object.hasOwn(d, "value") || !d.enumerable)
      throw new TypeError(label + " requires enumerable data properties");
    return [key, d.value];
  });
}
function checkedPath(path) {
  if (typeof path !== "string" || !path || Buffer.byteLength(path) > 512 ||
      path.includes("\\") || path.includes("\0") || path.startsWith("/") ||
      /^[a-z]:/i.test(path) || posix.normalize(path) !== path ||
      path.split("/").some(p => p === "." || p === ".." || p === ""))
    throw new TypeError("Relative canonical POSIX file path required");
  return path;
}
function validateSnapshot(snapshot) {
  const entries = recordEntries(snapshot, "snapshot");
  if (entries.length > 128) throw new TypeError("Too many candidate files");
  let bytes = 0;
  const paths = new Set();
  for (const [path, content] of entries) {
    checkedPath(path);
    if (typeof content !== "string" || Buffer.byteLength(content) > 65536)
      throw new TypeError("Candidate file size/type limit");
    bytes += Buffer.byteLength(content);
    if (bytes > 1048576) throw new TypeError("Candidate total size limit");
    paths.add(path);
  }
  for (const [path] of entries) {
    const segments = path.split("/");
    while (segments.length > 1) {
      segments.pop();
      if (paths.has(segments.join("/"))) throw new TypeError("File/directory collision");
    }
  }
  return Object.fromEntries(entries);
}
function validateBehavioralSpec(input) {
  const entries = recordEntries(input, "spec");
  const allowed = new Set(["kind", "entry", "exportName", "cases", "imports",
    "forbiddenExports", "format", "expected", "unchangedFiles", "probes"]);
  if (entries.some(([key]) => !allowed.has(key))) throw new TypeError("Unknown private spec field");
  const spec = Object.fromEntries(entries);
  const unchangedFiles = validateSnapshot(spec.unchangedFiles ?? {});
  if (spec.kind === "answer") {
    if (!["text", "json"].includes(spec.format)) throw new TypeError("Unsupported answer format");
    if (spec.format === "text" && typeof spec.expected !== "string")
      throw new TypeError("Text expectation must be a string");
    const expected = JSON.parse(encodeJson(spec.expected));
    return { kind: "answer", format: spec.format, expected, unchangedFiles };
  }
  if (spec.kind !== "javascript") throw new TypeError("Unsupported behavioral kind");
  const entry = checkedPath(spec.entry);
  if (typeof spec.exportName !== "string" || !spec.exportName || spec.exportName.length > 200)
    throw new TypeError("Export name required");
  if (!Array.isArray(spec.cases) || !spec.cases.length || spec.cases.length > 128)
    throw new TypeError("One to 128 private cases required");
  encodeJson(spec.cases);
  const cases = spec.cases.map(c => {
    const value = Object.fromEntries(recordEntries(c, "case"));
    if (!Array.isArray(value.args) || !Object.hasOwn(value, "expected") ||
        Object.keys(value).some(k => !["args", "expected"].includes(k)))
      throw new TypeError("Case requires args and expected only");
    return { args: JSON.parse(encodeJson(value.args)), expected: JSON.parse(encodeJson(value.expected)) };
  });
  if(spec.probes!==undefined&&(!Array.isArray(spec.probes)||spec.probes.length>8))throw new TypeError("Invalid entrypoint probes");
  const probes=(spec.probes??[]).map(probe=>{
    if(Object.keys(probe).sort().join(",")!=="cases,entry,exportName")throw new TypeError("Invalid probe fields");
    const checked=validateBehavioralSpec({kind:"javascript",...probe});
    return {entry:checked.entry,exportName:checked.exportName,cases:checked.cases};
  });
  const imports = spec.imports ?? [], forbiddenExports = spec.forbiddenExports ?? [];
  if (!Array.isArray(imports) || imports.length > 32 ||
      !Array.isArray(forbiddenExports) || forbiddenExports.length > 32)
    throw new TypeError("Invalid import/export audit");
  encodeJson(imports); encodeJson(forbiddenExports);
  imports.forEach(checkedPath);
  if (forbiddenExports.some(s => typeof s !== "string" || !s || s.length > 200))
    throw new TypeError("Invalid forbidden export name");
  return { kind: "javascript", entry, exportName: spec.exportName, cases,
    imports: [...imports], forbiddenExports: [...forbiddenExports], unchangedFiles, probes };
}
function protectedChecks(snapshot, spec) {
  return Object.entries(spec.unchangedFiles).map(([path, content]) => ({
    name: "protected file " + path,
    passed: Object.hasOwn(snapshot, path) && snapshot[path] === content
  }));
}
function finishChecks(checks) { return { accepted: checks.every(c => c.passed), checks }; }
function evaluateAnswer(submission, inputSpec) {
  const spec = validateBehavioralSpec(inputSpec);
  if (spec.kind !== "answer") throw new TypeError("Answer spec required");
  let snapshot;
  try { snapshot = validateSnapshot(submission.snapshot); }
  catch { return finishChecks([{ name: "valid submission files", passed: false }]); }
  const checks = protectedChecks(snapshot, spec);
  let passed = false;
  try {
    if (typeof submission.answer === "string" && Buffer.byteLength(submission.answer) <= 1048576)
      passed = spec.format === "text" ? submission.answer.trim() === spec.expected.trim() :
        jsonEqual(JSON.parse(submission.answer), spec.expected);
  } catch {}
  checks.push({ name: "answer matches private expectation", passed });
  return finishChecks(checks);
}
function dockerCommand(executable, args, { input, signal, timeoutMs = 3000,
  maxOutputBytes = 1048576 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(Object.assign(new Error("Grading aborted"), { code: "ABORTED" })); return; }
    const child = spawn(executable, args, { shell: false, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [], stderr = []; let size = 0, failure, finished = false, killTimer;
    const terminate = error => {
      failure ??= error;
      child.kill("SIGTERM");
      killTimer ??= setTimeout(() => child.kill("SIGKILL"), 200);
    };
    const abort = () => terminate(Object.assign(new Error("Grading aborted"), { code: "ABORTED" }));
    const timer = setTimeout(() => terminate(Object.assign(new Error("Docker command timed out"),
      { code: "TIMEOUT" })), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    const complete = (error, result) => {
      if (finished) return; finished = true;
      clearTimeout(timer); clearTimeout(killTimer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error); else resolve(result);
    };
    for (const [stream, chunks] of [[child.stdout, stdout], [child.stderr, stderr]])
      stream.on("data", chunk => {
        size += chunk.length;
        if (size > maxOutputBytes)
          terminate(Object.assign(new Error("Container output limit"), { code: "OUTPUT_LIMIT" }));
        else chunks.push(chunk);
      });
    child.once("error", error => complete(error));
    child.once("close", (code, childSignal) => complete(failure, {
      code, signal: childSignal, stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8")
    }));
    child.stdin.on("error", () => {});
    child.stdin.end(input ?? "");
  });
}
class BehavioralInfrastructureError extends Error {
  constructor(message, options) { super(message, options); this.name = "BehavioralInfrastructureError"; }
}
async function createBehavioralEvaluator({
  image = "node:24-bookworm-slim", docker = "docker", executionTimeoutMs = 8000,
  controlTimeoutMs = 3000, memoryMb = 256, cpus = 1, pidsLimit = 64,
  maxOutputBytes = 1048576, temporaryRoot = process.env.KOVAN_EVALUATOR_TMPDIR ?? tmpdir()
} = {}) {
  if (!["linux","darwin"].includes(process.platform)) throw new BehavioralInfrastructureError("Docker grading host must be Linux or macOS");
  if(typeof temporaryRoot!=="string"||!temporaryRoot||temporaryRoot.includes(","))throw new TypeError("Valid Docker-shared temporary root required");
  const stagingRoot=await realpath(temporaryRoot);
  if(stagingRoot.includes(","))throw new TypeError("Docker staging path cannot contain commas");
  if (typeof image !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.:@/-]{0,511}$/.test(image))
    throw new TypeError("Trusted image reference required");
  for (const [value, min, max] of [[executionTimeoutMs,100,60000],[controlTimeoutMs,100,10000],
    [memoryMb,64,1024],[pidsLimit,16,256],[maxOutputBytes,1024,4194304]])
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError("Invalid grading limit");
  if (!Number.isFinite(cpus) || cpus < 0.1 || cpus > 2) throw new TypeError("Invalid CPU quota");
  const run = (args, options = {}) => dockerCommand(docker, args,
    { timeoutMs: controlTimeoutMs, maxOutputBytes, ...options });
  const daemon=await run(["info","--format","{{.OSType}}"]);
  if(daemon.code!==0||daemon.stdout.trim()!=="linux")throw new BehavioralInfrastructureError("A reachable Linux Docker engine is required; start Docker Desktop on macOS");
  const inspected = await run(["image","inspect","--format","{{json .}}",image]);
  if (inspected.code !== 0) throw new BehavioralInfrastructureError("Pre-pull the trusted grading image");
  let imageInfo;
  try { imageInfo = JSON.parse(inspected.stdout); } catch { throw new BehavioralInfrastructureError("Invalid image inspection"); }
  if(imageInfo.Os!=="linux")throw new BehavioralInfrastructureError("The trusted grading image must use Linux");
  const imageId = imageInfo.Id;
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId ?? "")) throw new BehavioralInfrastructureError("Missing immutable image ID");
  const provenance = Object.freeze({
    backend: "docker", imageRequested: image, imageId,
    hostPlatform:process.platform,imageArchitecture:imageInfo.Architecture,daemonOs:"linux",
    repoDigests: Object.freeze([...(imageInfo.RepoDigests ?? [])]),
    executionTimeoutMs, controlTimeoutMs, memoryMb, cpus, pidsLimit, maxOutputBytes,
    workerSha256: createHash("sha256").update(WORKER).digest("hex"),
    network: "none", rootFilesystem: "read-only", user: "65534:65534"
  });
  async function evaluate(submission, inputSpec, { signal } = {}) {
    const spec = validateBehavioralSpec(inputSpec);
    if (spec.kind === "answer") return evaluateAnswer(submission, spec);
    let snapshot;
    try { snapshot = validateSnapshot(submission.snapshot); }
    catch { return finishChecks([{ name: "valid submission files", passed: false }]); }
    const checks = protectedChecks(snapshot, spec);
    if (checks.some(c => !c.passed)) return finishChecks(checks);
    const cases=[...spec.cases.map(c=>({...c,entry:spec.entry,exportName:spec.exportName})),...spec.probes.flatMap(p=>p.cases.map(c=>({...c,entry:p.entry,exportName:p.exportName})))];
    const invocation=encodeJson({entry:spec.entry,exportName:spec.exportName,imports:spec.imports,calls:cases.map(c=>({entry:c.entry,exportName:c.exportName,args:c.args}))});
    const directory = await mkdtemp(join(stagingRoot, "behavioral-grade-"));
    const candidate = join(directory, "candidate"), worker = join(directory, "worker.mjs");
    const name = "behavioral-" + randomUUID();
    let createAttempted = false;
    try {
      await mkdir(candidate, { mode: 0o755 }); await chmod(candidate, 0o755);
      for (const [path, content] of Object.entries(snapshot)) {
        const destination = join(candidate, path);
        await mkdir(dirname(destination), { recursive: true, mode: 0o755 });
        for (let dir = dirname(destination); dir !== candidate; dir = dirname(dir))
          await chmod(dir, 0o755);
        await writeFile(destination, content, { mode: 0o644, flag:"wx" });
        await chmod(destination, 0o644);
      }
      await writeFile(worker, WORKER, { mode: 0o644 }); await chmod(worker, 0o644);
      signal?.throwIfAborted();
      createAttempted = true;
      const created = await run(["create","--name",name,"--pull","never","-i",
        "--network","none","--read-only","--cap-drop","ALL",
        "--security-opt","no-new-privileges","--pids-limit",String(pidsLimit),
        "--memory",memoryMb+"m","--memory-swap",memoryMb+"m","--cpus",String(cpus),
        "--user","65534:65534","--tmpfs","/tmp:rw,noexec,nosuid,size=16m",
        "--env","NODE_OPTIONS=","--env","NODE_PATH=","--env","HOME=/tmp",
        "--mount","type=bind,src="+candidate+",dst=/candidate,readonly",
        "--mount","type=bind,src="+worker+",dst=/worker.mjs,readonly",
        "--workdir","/candidate","--entrypoint","/usr/local/bin/node",
        imageId,"--max-old-space-size=128","/worker.mjs"], { signal });
      if (created.code !== 0 || !/^[a-f0-9]{64}$/.test(created.stdout.trim()))
        throw new BehavioralInfrastructureError("Could not create isolated grading container");
      let result, executionError;
      try {
        result = await run(["start","--attach","--interactive",name],
          { input: invocation, signal, timeoutMs: executionTimeoutMs });
      } catch (error) { executionError = error; }
      const inspectedState = await run(["inspect","--format","{{json .State}}",name]);
      if (inspectedState.code !== 0) throw new BehavioralInfrastructureError("Could not inspect grading state");
      const state = JSON.parse(inspectedState.stdout);
      if (!state.StartedAt || state.StartedAt.startsWith("0001-"))
        throw new BehavioralInfrastructureError("Grading container did not start");
      if (signal?.aborted || executionError?.code === "ABORTED")
        throw new BehavioralInfrastructureError("Private grading cancelled", { cause: executionError });
      if (executionError) {
        if (!["TIMEOUT","OUTPUT_LIMIT"].includes(executionError.code))
          throw new BehavioralInfrastructureError("Docker attachment failed", { cause: executionError });
        checks.push({ name: executionError.code === "TIMEOUT" ? "candidate execution timeout" :
          "candidate output limit", passed: false });
        return finishChecks(checks);
      }
      if (state.Running || state.OOMKilled || state.ExitCode !== 0) {
        checks.push({ name: state.OOMKilled ? "candidate memory limit" : "candidate process completed", passed: false });
        return finishChecks(checks);
      }
      if (result.code !== 0) throw new BehavioralInfrastructureError("Docker attachment returned an inconsistent status");
      let report;
      try { report = JSON.parse(result.stdout); encodeJson(report); } catch { report = null; }
      if (!report || report.protocol !== 1 || report.fatal !== null ||
          !Array.isArray(report.exports) || report.exports.some(s => typeof s !== "string") ||
          !Array.isArray(report.results) || report.results.length !== cases.length) {
        checks.push({ name: "candidate import and result protocol", passed: false });
        return finishChecks(checks);
      }
      checks.push({ name: "required export", passed: report.exports.includes(spec.exportName) });
      checks.push({ name: "removed exports", passed: spec.forbiddenExports.every(n => !report.exports.includes(n)) });
      for (let i = 0; i < cases.length; i++) {
        const result = report.results[i];
        let passed = false;
        try { passed = result?.ok === true && Object.hasOwn(result, "value") &&
          jsonEqual(result.value, cases[i].expected); } catch {}
        checks.push({ name: "private behavioral case " + (i + 1), passed });
      }
      return finishChecks(checks);
    } finally {
      try {
        if (createAttempted) {
          const removed = await run(["rm","--force",name]);
          if (removed.code !== 0 && !removed.stderr.includes("No such container"))
            throw new BehavioralInfrastructureError("Could not remove owned grading container");
        }
      } finally { await rm(directory, { recursive: true, force: true }); }
    }
  }
  Object.defineProperty(evaluate, "provenance", { value: provenance, enumerable: true });
  return evaluate;
}
async function verifyBehavioralFixtures(evaluate, fixtures, { signal } = {}) {
  if (!Array.isArray(fixtures) || !fixtures.length) throw new TypeError("Fixtures required");
  const checks = [], ids = new Set();
  for (const fixture of fixtures) {
    const id = fixture?.task?.id;
    if (typeof id !== "string" || ids.has(id)) throw new TypeError("Unique fixture IDs required");
    ids.add(id);
    const spec = validateBehavioralSpec(fixture.evaluateSpec);
    const reference = await evaluate({
      snapshot: fixture.referenceFiles ?? fixture.task.files,
      answer: fixture.referenceAnswer ?? "done"
    }, spec, { signal });
    if (!reference.accepted) throw new BehavioralInfrastructureError("Reference rejected for fixture " + id);
    const badAnswer = spec.kind === "answer" && spec.format === "text" ?
      (spec.expected.trim() === "__incorrect__" ? "__different__" : "__incorrect__") : "";
    const initial = await evaluate({ snapshot: fixture.task.files, answer: badAnswer }, spec, { signal });
    if (initial.accepted) throw new BehavioralInfrastructureError("Initial candidate passes fixture " + id);
    checks.push({ id, referenceAccepted: true, initialRejected: true });
  }
  return { verified: true, checks, provenance: evaluate.provenance };
}

const encodeJson = makeJsonCodec();
async function workerMain() {
  const parse = JSON.parse.bind(JSON), getKeys = Object.keys;
  const write = process.stdout.write.bind(process.stdout);
  globalThis.console = new Console({ stdout: process.stderr, stderr: process.stderr });
  process.stdin.setEncoding("utf8");
  let inputText = "";
  for await (const chunk of process.stdin) {
    inputText += chunk;
    if (Buffer.byteLength(inputText) > 1048576) throw new Error("Input too large");
  }
  const request = parse(inputText), results = [];
  let names = [], fatal = null;
  try {
    const namespace = await import(pathToFileURL("/candidate/" + request.entry).href);
    names = getKeys(namespace);
    for (let i = 0; i < request.imports.length; i++)
      await import(pathToFileURL("/candidate/" + request.imports[i]).href);
    const fn = namespace[request.exportName];
    if (typeof fn !== "function") throw new Error("Requested export is not a function");
    for (let i = 0; i < request.calls.length; i++) {
      try {
        const call=request.calls[i],target=await import(pathToFileURL("/candidate/"+call.entry).href);
        const value=await target[call.exportName](...call.args);
        const clean = parse(encode(value));
        results[results.length] = { ok: true, value: clean };
      } catch {
        results[results.length] = { ok: false, error: "threw_or_non_json" };
      }
    }
  } catch { fatal = "import_or_export_error"; }
  write(encode({ protocol: 1, exports: names, results, fatal }) + "\n");
  process.exitCode = 0;
}
const WORKER='import { Console } from "node:console";\nimport { pathToFileURL } from "node:url";\nconst encode = ('+makeJsonCodec.toString()+')(1048576);\n('+workerMain.toString()+')().catch(() => { process.stderr.write("Worker failed\\n"); process.exitCode = 1; });\n';
export { BehavioralInfrastructureError, createBehavioralEvaluator, evaluateAnswer, jsonEqual, jsonText, validateBehavioralSpec, validateSnapshot, verifyBehavioralFixtures };
