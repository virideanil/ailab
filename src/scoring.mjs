// Pure point estimates. This module does not compute confidence intervals.
const SYSTEMS = ["baseline", "candidate"];
const EPS = 1e-12;
const fail = message => { throw new Error(message); };
const nonempty = x => typeof x === "string" && x.length > 0;
const finite = x => typeof x === "number" && Number.isFinite(x);
const key = (system, task, repeat) => JSON.stringify([system, task, repeat]);
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

export function scoreExperiment(design, runs) {
  if (!design || typeof design !== "object") fail("Invalid design");
  const { tasks, strataWeights, repeats, systemVersions,
    evaluatorVersion, taskSetVersion } = design;
  if (!Array.isArray(tasks) || tasks.length === 0) fail("No assigned tasks");
  if (!Array.isArray(runs)) fail("Runs must be an array");
  if (!Number.isSafeInteger(repeats) || repeats < 1) fail("Invalid repeats");
  if (!nonempty(evaluatorVersion) || !nonempty(taskSetVersion))
    fail("Missing evaluation identity");
  for (const system of SYSTEMS)
    if (!nonempty(systemVersions?.[system])) fail("Missing system version");

  const weights = Object.entries(strataWeights ?? {});
  if (!weights.length || weights.some(([s, w]) =>
      !nonempty(s) || !finite(w) || w <= 0) ||
      Math.abs(weights.reduce((a, [, w]) => a + w, 0) - 1) > EPS)
    fail("Stratum weights must be positive and sum to one");
  const weightMap = new Map(weights);
  const taskMap = new Map();
  const counts = new Map(weights.map(([s]) => [s, 0]));
  for (const input of tasks) {
    if (!input || typeof input !== "object") fail("Invalid task");
    const { id, version, clusterId, stratum, deadlineMs } = input;
    if (![id, version, clusterId, stratum].every(nonempty) ||
        !finite(deadlineMs) || deadlineMs <= 0) fail("Invalid task definition");
    if (taskMap.has(id)) fail("Duplicate task");
    if (!weightMap.has(stratum)) fail("Unknown stratum");
    taskMap.set(id, { id, version, clusterId, stratum, deadlineMs });
    counts.set(stratum, counts.get(stratum) + 1);
  }
  if ([...counts.values()].some(n => n === 0)) fail("Empty stratum");

  const slots = new Map();
  for (const r of runs) {
    if (!r || typeof r !== "object") fail("Invalid run");
    const task = taskMap.get(r.taskId);
    if (!task || !SYSTEMS.includes(r.system)) fail("Unknown task or system");
    if (!Number.isSafeInteger(r.repeat) || r.repeat < 0 || r.repeat >= repeats)
      fail("Unknown repeat");
    if (r.systemVersion !== systemVersions[r.system] ||
        r.evaluatorVersion !== evaluatorVersion ||
        r.taskSetVersion !== taskSetVersion ||
        r.taskVersion !== task.version || r.deadlineMs !== task.deadlineMs)
      fail("Mixed identity or deadline");
    if (typeof r.valid !== "boolean" || typeof r.accepted !== "boolean")
      fail("Missing validity or acceptance");
    const elapsedMs = r.elapsedMs ?? null;
    if (elapsedMs !== null && (!finite(elapsedMs) || elapsedMs < 0))
      fail("Invalid elapsed time");
    if (r.accepted && (!r.valid || elapsedMs === null ||
        elapsedMs > task.deadlineMs)) fail("Inconsistent acceptance");
    if (!r.valid && !nonempty(r.invalidReason))
      fail("Invalid measurement needs a reason");
    const slot = key(r.system, task.id, r.repeat);
    if (slots.has(slot)) fail("Duplicate run slot");
    slots.set(slot, { system: r.system, taskId: task.id, repeat: r.repeat,
      valid: r.valid, accepted: r.accepted, elapsedMs,
      invalidReason: r.valid ? null : r.invalidReason });
  }

  const pairedGroups = [...taskMap.values()].map(task => ({
    task, weight: weightMap.get(task.stratum) / counts.get(task.stratum),
    pairs: Array.from({ length: repeats }, (_, repeat) => ({
      repeat,
      baseline: slots.get(key("baseline", task.id, repeat)) ?? null,
      candidate: slots.get(key("candidate", task.id, repeat)) ?? null
    }))
  }));

  const systems = Object.fromEntries(SYSTEMS.map(system => {
    const perTask = pairedGroups.map(group => {
      const observations = group.pairs.map(pair => pair[system]);
      const complete = observations.every(r => r !== null && r.valid);
      const elapsedComplete = complete &&
        observations.every(r => r.elapsedMs !== null);
      return { taskId: group.task.id, stratum: group.task.stratum,
        clusterId: group.task.clusterId, weight: group.weight, complete,
        missingRepeats: observations.flatMap((r, i) => r ? [] : [i]),
        invalidRepeats: observations.flatMap((r, i) =>
          r !== null && !r.valid ? [i] : []),
        elapsedComplete,
        meanObservedElapsedMs: elapsedComplete ?
          mean(observations.map(r => r.elapsedMs)) : null,
        acceptedRate: complete ?
          mean(observations.map(r => Number(r.accepted))) : null,
        cost: complete ? mean(observations.map(r =>
          r.accepted ? r.elapsedMs / group.task.deadlineMs : 1)) : null
      };
    });
    const perStratum = Object.fromEntries(weights.map(([stratum]) => {
      const rows = perTask.filter(task => task.stratum === stratum);
      const complete = rows.every(task => task.complete);
      return [stratum, { complete,
        acceptedRate: complete ? mean(rows.map(t => t.acceptedRate)) : null,
        cost: complete ? mean(rows.map(t => t.cost)) : null }];
    }));
    const complete = perTask.every(task => task.complete);
    const elapsedComplete = perTask.every(task => task.elapsedComplete);
    const acceptedRate = complete ?
      perTask.reduce((a, t) => a + t.weight * t.acceptedRate, 0) : null;
    const cost = complete ?
      perTask.reduce((a, t) => a + t.weight * t.cost, 0) : null;
    const meanObservedElapsedMs = elapsedComplete ?
      perTask.reduce((a, t) => a + t.weight * t.meanObservedElapsedMs, 0) : null;
    let cdf = null, t50Ms = null, t50Status = "incomplete";
    if (complete) {
      const events = new Map();
      for (const group of pairedGroups) for (const pair of group.pairs) {
        const r = pair[system];
        if (r.accepted) events.set(r.elapsedMs,
          (events.get(r.elapsedMs) ?? 0) + group.weight / repeats);
      }
      let mass = 0;
      cdf = [...events].sort(([a], [b]) => a - b).map(([tMs, weight]) => {
        mass += weight;
        return { tMs, acceptedWeight: Math.min(1, mass) };
      });
      t50Ms = cdf.find(p => p.acceptedWeight >= 0.5 - EPS)?.tMs ?? null;
      t50Status = t50Ms === null ? "unreached" : "reached";
    }
    return [system, { complete, elapsedComplete, meanObservedElapsedMs,
      acceptedRate, cost, cdf, t50Ms, t50Status, perTask, perStratum }];
  }));

  const pairedOutcomes = {
    bothAccepted: 0, baselineOnly: 0, candidateOnly: 0, neitherAccepted: 0,
    missingOrInvalid: 0
  };
  for (const group of pairedGroups) for (const pair of group.pairs) {
    const weight = group.weight / repeats;
    if (!pair.baseline?.valid || !pair.candidate?.valid)
      pairedOutcomes.missingOrInvalid += weight;
    else if (pair.baseline.accepted && pair.candidate.accepted)
      pairedOutcomes.bothAccepted += weight;
    else if (pair.baseline.accepted) pairedOutcomes.baselineOnly += weight;
    else if (pair.candidate.accepted) pairedOutcomes.candidateOnly += weight;
    else pairedOutcomes.neitherAccepted += weight;
  }
  const baseline = systems.baseline, candidate = systems.candidate;
  const ready = baseline.complete && candidate.complete;
  const reached = baseline.t50Status === "reached" &&
    candidate.t50Status === "reached";
  const ratioStatus = !ready ? "incomplete" : !reached ? "unreached" :
    candidate.t50Ms === 0 ? "zero_time_resolution" : "available";
  return { systems, pairedGroups, pairedOutcomes,
    comparison: { ready,
      qualityDelta: ready ? candidate.acceptedRate - baseline.acceptedRate : null,
      costDelta: ready ? candidate.cost - baseline.cost : null,
      t50Ratio: ratioStatus === "available" ?
        baseline.t50Ms / candidate.t50Ms : null,
      ratioStatus, confidenceInterval: null,
      inference: "Point estimates only; no statistical decision." } };
}

export function completionAt(systemScore, elapsedMs) {
  if (!finite(elapsedMs) || elapsedMs < 0) fail("Invalid CDF query");
  if (!systemScore || !Array.isArray(systemScore.cdf)) return null;
  let mass = 0;
  for (const point of systemScore.cdf) {
    if (point.tMs > elapsedMs) break;
    mass = point.acceptedWeight;
  }
  return mass;
}

