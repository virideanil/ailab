import { parseArgs } from "node:util";
import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { fixtures } from "../fixtures/smoke.mjs";
import { runTask } from "./runner.mjs";
import { createLlamaAdapter } from "./llama-adapter.mjs";
import { scoreExperiment } from "./scoring.mjs";

const { values } = parseArgs({ options: {
  fake: { type: "boolean", default: false },
  endpoint: { type: "string", default: "http://127.0.0.1:8080" },
  model: { type: "string", default: "local" },
  out: { type: "string", default: "artifacts/experiment.json" },
  repeats: { type: "string", default: "1" },
  "deadline-ms": { type: "string", default: "30000" },
} });
const repeats = Number(values.repeats), deadlineMs = Number(values["deadline-ms"]);
if (!Number.isSafeInteger(repeats) || repeats < 1 || repeats > 20 ||
    !Number.isSafeInteger(deadlineMs) || deadlineMs < 100 || deadlineMs > 300000)
  throw new Error("Invalid repeats or deadline-ms");
if (Number(process.versions.node.split(".")[0]) < 24)
  throw new Error("Node 24+ required");
const root = fileURLToPath(new URL("../", import.meta.url));
const sha = text => createHash("sha256").update(text).digest("hex");
const sourceFiles = ["src/cli.mjs", "src/runner.mjs", "src/workspace.mjs",
  "src/llama-adapter.mjs", "src/scoring.mjs", "fixtures/smoke.mjs"];
const sources = Object.fromEntries(await Promise.all(sourceFiles.map(async p =>
  [p, sha(await readFile(join(root, p)))])));
const taskSetVersion = sources["fixtures/smoke.mjs"];
const mode = values.fake ? "fake" : "real";
const modelProfile = {
  mode, model: values.model, maxTokens: 256, seed: 42, temperature: 0,
  cachePrompt: false, deadlineMs, maxTurns: 12, sourceHashes: sources,
};
const systemVersions = Object.fromEntries(["baseline", "candidate"].map(system =>
  [system, sha(JSON.stringify({ ...modelProfile, system }))]));
const design = {
  tasks: fixtures.map((f, i) => ({ id: f.task.id, version: sha(JSON.stringify(f.task)),
    clusterId: f.task.id, stratum: i < 6 ? "coding" : "general", deadlineMs })),
  strataWeights: { coding: 0.8, general: 0.2 }, repeats, systemVersions,
  evaluatorVersion: taskSetVersion, taskSetVersion,
};
const report = {
  schemaVersion: 1, purpose: "exploratory harness smoke; not capability qualification",
  mode, performanceClaimEligible: false, startedAt: new Date().toISOString(),
  hardware: { platform: os.platform(), arch: os.arch(), release: os.release(),
    cpu: os.cpus()[0]?.model, logicalCpus: os.availableParallelism(),
    totalMemoryBytes: os.totalmem(), node: process.version },
  sourceCommit: process.env.GITHUB_SHA ?? null, sources, modelProfile, design,
  conditions: {
    order: "counterbalanced by task and repeat; deterministic",
    prefillCache: "disabled on every request",
    warmup: "one completion before measurement; cold start excluded",
    baseline: "sequential model-selected tools with filenames initially",
    candidate: "same loop with prompt-mentioned files preloaded with versions",
    preparationTime: "included", privateGradingTime: "excluded",
    memory: "Node process RSS only; llama-server memory not measured here",
  },
  runs: [], outcomes: [], currentTask: null,
};
await mkdir(dirname(values.out), { recursive: true });
let saveQueue = Promise.resolve();
function checkpoint() {
  report.score = scoreExperiment(design, report.runs);
  report.updatedAt = new Date().toISOString();
  const content = JSON.stringify(report, null, 2) + "\n";
  saveQueue = saveQueue.then(async () => {
    await writeFile(values.out + "." + process.pid + ".tmp", content);
    await rename(values.out + "." + process.pid + ".tmp", values.out);
  });
  return saveQueue;
}
await checkpoint();
let real;
if (!values.fake) {
  real = createLlamaAdapter({ baseUrl: values.endpoint, model: values.model });
  const start = performance.now();
  try {
    const response = await real.next({
      messages: [{ role: "user", content: 'Return {"type":"finish","answer":"ready"}.' }],
      signal: AbortSignal.timeout(30000),
    });
    report.warmup = { elapsedMs: performance.now() - start, action: response.action };
  } catch (error) {
    report.warmup = { elapsedMs: performance.now() - start, error: error.message };
    await checkpoint();
    throw error;
  }
}
for (let repeat = 0; repeat < repeats; repeat++) {
  for (let i = 0; i < fixtures.length; i++) {
    const fixture = fixtures[i];
    const order = (i + repeat) % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"];
    for (const system of order) {
      report.currentTask = { system, repeat, taskId: fixture.task.id,
        startedAt: new Date().toISOString(), events: [] };
      await checkpoint();
      const prepStarted = performance.now();
      const task = { ...fixture.task, deadlineMs };
      if (system === "candidate") {
        const files = Object.entries(task.files).filter(([path]) => task.prompt.includes(path));
        task.initialContext = JSON.stringify(files.map(([path, content]) =>
          ({ path, content, version: 1 })));
      }
      let scriptIndex = 0;
      const adapter = values.fake ? {
        id: "gold-script-fake", kind: "fake",
        next: async () => ({ action: structuredClone(fixture.script[scriptIndex++]), usage: {} }),
      } : real;
      const preparationMs = performance.now() - prepStarted;
      task.deadlineMs = Math.max(1, deadlineMs - preparationMs);
      const outcome = await runTask({ task, adapter, evaluate: fixture.evaluate,
        onEvent(event) {
          report.currentTask.events.push(event);
          void checkpoint().catch(error => { report.telemetryError = error.message; });
        },
      });
      report.currentTask = null;
      const elapsedMs = outcome.elapsedMs + preparationMs;
      const accepted = outcome.accepted && elapsedMs <= deadlineMs;
      const status = outcome.accepted && !accepted ? "deadline" : outcome.status;
      const run = {
        system, systemVersion: systemVersions[system], evaluatorVersion: taskSetVersion,
        taskSetVersion, taskId: task.id, taskVersion: design.tasks[i].version,
        deadlineMs, repeat, valid: outcome.valid, accepted, elapsedMs,
        ...(!outcome.valid ? { invalidReason: outcome.invalidReason } : {}),
      };
      report.runs.push(run);
      report.outcomes.push({ system, repeat, preparationMs, ...outcome,
        accepted, elapsedMs, status, runnerStatus: outcome.status, nodeRssBytes: process.memoryUsage().rss });
      console.log(JSON.stringify({ system, repeat, task: task.id, status,
        accepted, elapsedMs: Math.round(elapsedMs), turns: outcome.turns,
        diagnostic: accepted ? undefined : { answer: outcome.answer, checks: outcome.checks,
          events: outcome.events.filter(e => ["execution_error", "model_response"].includes(e.type)).slice(-3) } }));
      await checkpoint();
    }
  }
}
report.complete = report.runs.length === fixtures.length * repeats * 2 &&
  report.runs.every(r => r.valid);
report.finishedAt = new Date().toISOString();
await checkpoint();
console.log(JSON.stringify({ mode, complete: report.complete,
  comparison: report.score.comparison,
  accepted: Object.fromEntries(["baseline", "candidate"].map(s =>
    [s, report.runs.filter(r => r.system === s && r.accepted).length])),
  output: values.out }));
if (!report.complete || (values.fake && report.runs.some(r => !r.accepted)))
  process.exitCode = 1;
