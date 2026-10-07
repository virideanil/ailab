export function runScoringTests(api) {
  const { scoreExperiment, completionAt } = api;
  const passed = [];
  const assert = (x, m) => { if (!x) throw new Error(m); };
  const near = (a, b) => Math.abs(a - b) < 1e-10;
  const throws = f => { let threw = false; try { f(); } catch { threw = true; }
    assert(threw, "Expected rejection"); };
  const test = (name, body) => { body(); passed.push(name); };
  const design = {
    repeats: 2, evaluatorVersion: "e1", taskSetVersion: "ts1",
    systemVersions: { baseline: "b1", candidate: "n1" },
    strataWeights: { coding: 1 },
    tasks: [{ id: "t", version: "v1", clusterId: "repo1",
      stratum: "coding", deadlineMs: 10 }]
  };
  const make = d => ["baseline", "candidate"].flatMap(system =>
    d.tasks.flatMap(task => Array.from({ length: d.repeats }, (_, repeat) => ({
      system, systemVersion: d.systemVersions[system],
      evaluatorVersion: d.evaluatorVersion, taskSetVersion: d.taskSetVersion,
      taskId: task.id, taskVersion: task.version, deadlineMs: task.deadlineMs,
      repeat, valid: true, accepted: true, elapsedMs: 8
    }))));
  const evaluate = runs => scoreExperiment(design, runs);
  test("CDF averages completion indicators rather than latencies", () => {
    const runs = make(design); runs[2].elapsedMs = 1; runs[3].elapsedMs = 9;
    const s = evaluate(runs);
    assert(s.systems.candidate.t50Ms === 1, "Wrong repetition median");
    assert(completionAt(s.systems.candidate, 1) === 0.5, "Wrong mass");
  });
  test("Fast failures pay full cost and cannot create a speed ratio", () => {
    const runs = make(design).map(r => r.system === "candidate" ?
      { ...r, accepted: false, elapsedMs: 0.1 } : r);
    const s = evaluate(runs);
    assert(s.systems.candidate.cost === 1, "Failure cost");
    assert(s.systems.candidate.t50Status === "unreached", "False median");
    assert(s.comparison.t50Ratio === null, "False speed");
  });
  test("Fixed stratum weights survive unequal task counts", () => {
    const d = { ...design, repeats: 1,
      strataWeights: { coding: 0.5, general: 0.5 },
      tasks: ["a", "b", "c", "g"].map(id => ({ ...design.tasks[0], id,
        stratum: id === "g" ? "general" : "coding" })) };
    const runs = make(d).map(r => r.system === "candidate" ?
      { ...r, accepted: r.taskId === "g", elapsedMs: 2 } : r);
    const s = scoreExperiment(d, runs);
    assert(near(s.systems.candidate.acceptedRate, 0.5), "Wrong acceptance");
    assert(near(s.systems.candidate.cost, 0.6), "Wrong cost");
  });
  test("Missing repeats do not silently shrink the denominator", () => {
    const s = evaluate(make(design).slice(0, -1));
    assert(s.systems.candidate.cost === null, "Missing run counted");
    assert(s.comparison.ratioStatus === "incomplete", "Missing ratio");
    assert(near(s.pairedOutcomes.missingOrInvalid, 0.5), "Missing mass");
  });
  test("Invalid evaluator observations make aggregate claims unavailable", () => {
    const runs = make(design);
    runs[2] = { ...runs[2], valid: false, accepted: false, elapsedMs: null,
      invalidReason: "evaluator crashed" };
    assert(!evaluate(runs).comparison.ready, "Invalid observation scored");
  });
  test("Mixed system model task evaluator or deadline identities reject", () => {
    for (const field of ["systemVersion", "evaluatorVersion",
      "taskSetVersion", "taskVersion", "deadlineMs"]) {
      const runs = make(design);
      runs[0] = { ...runs[0], [field]: field === "deadlineMs" ? 11 : "bad" };
      throws(() => evaluate(runs));
    }
  });
  test("Duplicate slots cannot select favorable repeated results", () => {
    const runs = make(design);
    throws(() => evaluate([...runs, runs[0]]));
  });
  test("Impossible accepted timings reject", () => {
    for (const elapsedMs of [null, NaN, -1, 11, Infinity, "8"]) {
      const runs = make(design); runs[2] = { ...runs[2], elapsedMs };
      throws(() => evaluate(runs));
    }
  });
  test("Zero resolution cannot imply infinite speed", () => {
    const runs = make(design).map(r => r.system === "candidate" ?
      { ...r, elapsedMs: 0 } : r);
    assert(evaluate(runs).comparison.ratioStatus === "zero_time_resolution",
      "Infinite speed");
  });
  test("Boundary completion is accepted and zero-time CDF is explicit", () => {
    const runs = make(design).map(r => ({ ...r, elapsedMs: 10 }));
    const s = evaluate(runs).systems.candidate;
    assert(completionAt(s, 9.999) === 0 && completionAt(s, 10) === 1,
      "Deadline boundary");
    assert(completionAt(s, 0) === 0, "False zero completion");
  });
  test("Missing physical time is null rather than fabricated failure time", () => {
    const runs = make(design).map(r => r.system === "candidate" ?
      { ...r, accepted: false, elapsedMs: null } : r);
    const s = evaluate(runs).systems.candidate;
    assert(s.cost === 1 && s.meanObservedElapsedMs === null &&
      !s.elapsedComplete, "Missing telemetry converted to zero");
  });
  test("All paired outcome classes retain their assigned mass", () => {
    const d = { ...design, repeats: 1,
      tasks: ["both", "baseline", "candidate", "neither"].map(id =>
        ({ ...design.tasks[0], id })) };
    const runs = make(d).map(r => ({ ...r,
      accepted: r.taskId === "both" || r.taskId === r.system }));
    const s = scoreExperiment(d, runs);
    for (const field of ["bothAccepted", "baselineOnly",
      "candidateOnly", "neitherAccepted"])
      assert(near(s.pairedOutcomes[field], 0.25), "Wrong paired outcomes");
    assert(s.pairedOutcomes.missingOrInvalid === 0, "False invalid mass");
  });
  test("Invalid designs and unknown records fail closed", () => {
    throws(() => scoreExperiment({ ...design, repeats: 0 }, []));
    throws(() => scoreExperiment({ ...design, strataWeights: { coding: 0.8 } }, []));
    throws(() => scoreExperiment({ ...design, tasks: [] }, []));
    throws(() => scoreExperiment({ ...design,
      tasks: [design.tasks[0], design.tasks[0]] }, []));
    const runs = make(design); runs[0].taskId = "unknown";
    throws(() => evaluate(runs));
  });
  test("Invalid measurement requires a reason and cannot be accepted", () => {
    const runs = make(design);
    runs[0] = { ...runs[0], valid: false, accepted: false };
    throws(() => evaluate(runs));
    runs[0] = { ...runs[0], accepted: true, invalidReason: "bad clock" };
    throws(() => evaluate(runs));
  });
  test("Input arrays and nested objects are immutable", () => {
    const freeze = value => { if (value && typeof value === "object") {
      Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    const d = JSON.parse(JSON.stringify(design));
    const runs = make(d); const before = JSON.stringify([d, runs]);
    scoreExperiment(freeze(d), freeze(runs));
    assert(JSON.stringify([d, runs]) === before, "Input mutation");
  });
  test("CDF queries reject invalid time and expose incomplete data", () => {
    const s = evaluate(make(design)).systems.candidate;
    for (const time of [-1, NaN, Infinity, "1"])
      throws(() => completionAt(s, time));
    const incomplete = evaluate([]).systems.candidate;
    assert(completionAt(incomplete, 10) === null, "Incomplete CDF fabricated");
  });
  return { passed: passed.length, failed: 0, tests: passed,
    environment: "pure JavaScript runtime",
    claim: "Unit correctness only; no model or laptop benchmark." };
}

