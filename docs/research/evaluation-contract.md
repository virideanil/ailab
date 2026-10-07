# Project goals and comparison protocol for local AI

> Research snapshot: 7 October 2026. [Original Page](https://chatgpt.com/space/page_2979a343ac388191bc4e7ad7f8b36e9e). This document records evidence, hypotheses, and proposed experiments. Implemented scope is described in the [repository README](../../README.md); proposals are not measured product capabilities. The [evaluation contract](evaluation-contract.md) governs qualification where older research language differs.

Build a local assistant for ordinary 8–16 GB laptops that finishes useful coding work substantially faster while preserving correctness, user edits, and honest reporting. Keep GGUF models interchangeable and preserve a shared foundation for local document and data work.

This contract defines the version 1 goal, conventional comparators, task acceptance rules, measurement procedures, implementation gates, and the process for repairing unsuccessful experiments. It governs the [architecture and roadmap](architecture.md) and the [frontier experiment program](frontier-experiments.md). Numerical targets below are project requirements to test, not predicted or measured results. Version 1 is dated 7 October 2026.

The first supported scope is bounded Python and TypeScript coding in local repositories, plus grounded document questions, extraction, calculations, and file transformations. Language selection can change after inspecting the actual project, before freezing the evaluation. Open-ended autonomous projects, arbitrary languages, and all consumer hardware are outside the initial qualification claim.

## 1 The project goal and release requirements

The version 1 goal is to deliver a fully local coding-first assistant whose median deadline-qualified completion time is at least 2× faster than the best deployable conventional system selected under the same laptop resource budget, while accepted-task quality is no more than 2 percentage points worse and the absolute capability requirements below are met. Section 5 defines that median over all assigned tasks and the uncertainty required for the claim.

This is a system goal. Demonstrating the same improvement with the same model identifies an architectural gain; changing models or runtime architecture may still produce a valuable system win but must be labeled separately. Claims apply to the tested device profile and task distribution.

| Requirement | Version 1 target |
| --- | --- |
| Overall speed | At least 2× improvement in median completion across the fixed task mix, confirmed by the declared interval rule |
| Relative quality | No more than a 2 percentage-point loss in accepted tasks, with adequate evidence for noninferiority |
| Absolute coding capability | At least 85% accepted local/refactor tasks, 70% bounded bug fixes, and 60% bounded multi-file changes |
| Grounded general capability | At least 90% accepted tasks on the defined document/data track |
| Hard-task protection | Deadline-normalized completion cost must not worsen overall or separately for bug fixes and multi-file changes |
| Execution fidelity | No unresolved critical stale edit, wrong-scope mutation, duplicate effect, hidden-test tampering, or fabricated/misreported check results |
| Locality and memory | Complete the core suite without remote inference within the declared whole-application memory envelope |
| Model interchangeability | At least two qualified GGUF profiles with truthful capabilities, state isolation, cancellation, and recovery |
| Sustained usefulness | The claimed profile remains useful in the mixed-session test without persistent paging or accumulating unbounded state |

Capability percentages are intended minimum underlying rates, not rounded scores from a tiny panel. Report intervals and require adequate lower-bound evidence before making a formal capability claim. Zero observed critical incidents is a release gate, not a proof that the true rate is zero. Critical deterministic contract tests must also pass.

Add a stretch goal of 5× improvement on a separately declared repeated-work session. It must include preparation, guard checks, invalidation, changed dependencies, and fallback. It cannot substitute for the primary fresh-task goal or be advertised as universal acceleration.

A fixed successful execution obeys a useful limit: if a component occupies fraction f of its critical-path latency and is accelerated by factor s, ideal overall speedup is 1 / ((1 − f) + f/s), before new overhead. A component consuming 20% of the time cannot deliver a 2× whole-task improvement alone, even if eliminated. Measure where time goes; large gains may require removing model turns, repairs, loading, or repeated tool work as well as accelerating inference.

Targets may be refined before the evaluation freeze when actual project/hardware facts change. Record the previous requirement, the reason, and the new scope. After confirmation starts, a failed target stays failed for that revision; a narrower or different goal is a new declared claim.

## 2 What we compare

There are three questions: which model is useful, whether a mechanism helps that model, and whether the complete system beats a strong conventional alternative. Keep the answers separate.

| Configuration | Definition and purpose |
| --- | --- |
| Direct model reference | The model in its documented normal inference configuration on fixed prompts or completion tasks. Qualifies conversion, templates, generation behavior, and model capability. It is not an adequate end-to-end coding competitor by itself. |
| Strong simple agent | A small conventional tool loop using the same model, task inputs, available evidence, tools, limits, and executor. Establishes a same-model architectural comparison. |
| Best fitting conventional system | A credible existing local coding setup using the best deployable model and documented tuning selected on development tasks within the same laptop and memory envelope. Establishes practical value. |
| One experimental change | A qualified baseline plus one intervention, such as draft proposals, a controller, cache reuse, or a runtime kernel. Establishes a mechanism's contribution. |
| Combined proposed system | Only qualified components combined into a deployable policy. Establishes whether individual benefits survive interactions and overhead. |
| Larger quality reference | An optional stronger model when legitimately available. Describes the remaining capability gap; results on different resources cannot establish a laptop speed win. |

Stock defaults and a competently tuned baseline should both be visible. The tuned comparator must receive an equal declared tuning budget and its correct chat template, supported context, useful native caches, and available documented optimizations. Do not deliberately give it a weak prompt, slow thread count, or missing source evidence. Select a deployable policy on development data; choosing the fastest configuration separately for each hidden task after seeing results is an oracle analysis, not a usable baseline.

For a strict kernel/runtime test, hold the model artifact, serialized input tokens, generation settings, and requested output workload fixed. For a strict mechanism test, hold weights, quantization, tokenizer, template, sampling, context contents, source snapshot, and execution tools fixed wherever the intervention permits. If context selection, output format, or tools are the intervention, identify that changed factor explicitly rather than claiming an identical-prompt experiment. For an architecture comparison, equal access to source information does not require identical retrieved snippets: selecting better evidence may be the intervention. Add a conventional agent using the same semantic tools to determine whether gains come from the tools or from the coordinator.

For a whole-system test, each system may use its documented strategy within equal access, wall-time, total memory, and effect permissions. Different models need different faithful templates. Record effective prompts rather than forcing an inappropriate universal template. Tokens are diagnostic: equal token counts across tokenizers or autoregressive and diffusion systems do not establish equal work.

Record every candidate considered, selection rule, tuning cost, and rejection reason. Use a small development tournament to choose finalists; do not run every model, mechanism, cache state, and hardware setting in a combinatorial full cross product.

## 3 Tasks and acceptance oracles

The earlier 50-case smoke proposal is replaced by three explicit levels: eight harness fixtures, a 60-case development pilot, and a 240-case qualification set. None of these counts alone establishes adequate statistical power for a narrow reliability claim.

The eight harness fixtures cover exact lookup, paraphrased lookup, a single-file fix, a cross-file change, misleading test success, stale-source application, a changed dependency, and interruption/recovery. They validate the evaluator and runner before measuring a novel architecture.

The development pilot contains 40 coding tasks across four repositories, 12 general tasks, and eight lifecycle cases. Begin with two Python and two TypeScript repositories. Use it to discover defects, choose candidates, estimate variance and run cost, and fix task deadlines. Development results cannot serve as final confirmation.

The qualification set uses eight previously unseen repositories, four per language, and separate local documents/data. Each repository contributes eight local/refactor tasks, eight bug fixes, and four multi-file changes, for 20 tasks per repository:

| Track | Cases | Acceptance evidence |
| --- | ---: | --- |
| Local changes and supported refactors | 64 | Required symbol/reference changes, preserved behavior and API contracts, correct edit scope |
| Bounded bug fixes | 64 | A reproducible trigger, trusted expected behavior, adjacent regression checks |
| Bounded changes across several files | 32 | The requested behavior across dependencies, maintained interfaces, relevant integration checks |
| Grounded general tasks | 40 | Source spans for factual answers, exact extracted fields, independently computed numbers or resulting files |
| Lifecycle and execution behavior | 40 | Explicit required behavior under stale state, interruption, ambiguity, unavailable capabilities, and failures |

The primary useful-task score weights coding at 80% and general tasks at 20%, matching the first 200 cases. Lifecycle cases are a separate release gate; easy cancellation cases must not inflate task quality. Coding weights remain 40% local/refactor, 40% bug repair, and 20% multi-file. Publish every category as well as the aggregate.

Every task package is prepared before a run: visible request, starting snapshot, deliberate user changes if any, allowed information/tools, deadline, and evaluator. Keep hidden checks and gold outputs outside the model's readable repository and git history. Scrub inaccessible later commits, solution branches, and generated indexes that would reveal the answer. Indexing a repository is allowed; leaking its future fix is not.

A coding pass requires the requested behavior, scope constraints, and relevant regression checks. Do not demand the reference patch's exact text when another implementation is valid. Compilation, model-generated tests, and the model's statement that it is done are insufficient alone. Check the evaluator against known-good and deliberately wrong outputs before admitting a task.

For a TTL-boundary example, the hidden check must distinguish expiration exactly at the boundary, just before it, and just after it, while confirming unrelated cache behavior and existing user edits survive. This demonstrates behavioral acceptance rather than patch-string matching.

Allocate the 40 general cases as ten cited document questions/comparisons, eight extraction tasks, eight calculations, eight file transformations, and six genuinely missing-information cases. Clarification or abstention counts as correct only when the task contract calls for it. Open-ended writing quality is a separate blinded review track, not silently folded into an exact-answer score.

Use repository-family and time splits, remove near duplicates, and distinguish newly authored tasks, planted defects, and historical issues. No public task is presumed contamination-free. Successful traces, fine-tuning data, memory banks, and workflow templates may use development material only. Test outcomes cannot feed a later supposedly independent test task. Reuse experiments have a separate chronological stream containing only earlier user-visible work.

Reserve fresh repositories/documents before tuning. Once developers inspect a qualification failure to design a workaround, that case becomes a regression case. It remains valuable evidence, but confirmation of the revision needs untouched cases.

## 4 Fidelity means four different things

**Task fidelity:** the result satisfies the request and preserves required behavior. Different correct patches can pass. An identical wrong answer cannot.

**Inference fidelity:** a claimed exact acceleration preserves the target model's intended computation or sampling contract. Check tokenizer IDs, rendered templates, positions, masks, stop conditions, logits where accessible, accepted tokens, and fresh-versus-restored state. Test rejected drafts and rollback. Greedy equality is expected for pinned paths with compatible deterministic numerics; cross-backend floating-point differences require documented tolerances and divergence analysis. A small test cannot prove equality of stochastic distributions: inspect the acceptance algorithm and state semantics, then supplement that with numerical and statistical checks. Equal seeds do not guarantee identical samples across implementations.

**Execution fidelity:** actions affect the intended source version exactly as the operation contract requires. Preserve unrelated edits, reject stale handles, avoid duplicate effects after uncertain tool outcomes, and stop admitting new effects after cancellation is registered. Track already-started effects until their outcome is known. Report partial or failed work accurately. Name the checks actually run and their outcomes. Hidden acceptance failure is a task-quality failure; claiming a check ran or passed when it did not is an execution-fidelity failure. Passing visible checks does not guarantee hidden behavioral correctness.

**Experimental fidelity:** the comparison changes what it says it changes. Pin artifacts, retain raw outcomes, count overhead, and keep evaluators independent. A faster model swap is not evidence that a new scheduler caused the gain.

Controller tuning, reduced precision, approximate LM-head prediction, learned early exit, diffusion, and learned memory are quality-changing mechanisms. Evaluate their task quality and generalization; do not label them exact accelerators. Conversely, exact speculation can preserve a target's distribution without improving that target's underlying coding capability.

Lifecycle cases include ambiguous symbols, malformed arguments, unavailable tools, false-green visible tests, changed dependencies, incompatible model states, cancellation, crashes, repeated requests, uncertain tool outcomes, and instruction-like text in repository/tool content. Assert the intended response for each. These scenarios complement deterministic state-machine tests; a few clean runs do not prove a near-zero failure probability.

## 5 Scoring speed without rewarding failure

For every primary task, record whether the final submitted artifact passes its independent acceptance contract by the predeclared deadline. Internal retries are allowed within the same budget and charged. Human corrections, oracle hints, and developer intervention invalidate an autonomous-success claim and are reported separately.

Proposed development deadlines are 120 seconds for local/refactor tasks, 300 seconds for bounded bug fixes, 600 seconds for multi-file changes, and 120 seconds for general tasks. Adjust these only during the pilot from task requirements and consumer-hardware observations, then freeze them equally for both systems. Timeout remains a task failure; silently extending only the candidate's deadline is prohibited.

**Primary completion curve.** F(t) is the weighted fraction of all assigned primary tasks that have produced an accepted final result by elapsed time t and within their own deadlines. Failed and timed-out tasks never enter the completed fraction. Do not remove them from the denominator. Report the whole curve and each task category.

Define T50 as the earliest elapsed time at which F(t) reaches 50%. Its ratio, T50_conventional / T50_proposed, is the primary speed factor. This is the median completion time of all assigned tasks with failures treated as non-completions, not the median of successful tasks alone. If either system cannot reach 50%, report that quantile as unreached and do not manufacture a finite speed ratio. Higher coverage points, including 70% and 90%, are reported only when reached; a 95th percentile among successes is labeled as conditional.

**Quality and failure accounting.** Report accepted-task rate by deadline, weighted overall and by category, plus paired wins and regressions. The quality gate is separate from the speed gate. A fast system that solves too few tasks fails the project goal.

Also calculate a deadline-normalized cost: a successful task contributes elapsed time divided by its deadline; a failed or timed-out task contributes 1. Average using the frozen category weights. This is a scoring penalty, not invented elapsed time. Report actual consumed time alongside it. For the complete project claim, require the upper one-sided 95% confidence bound of proposed-minus-conventional normalized cost to be no greater than zero overall and separately for the protected bug-fix and multi-file strata. This guards against a median win concealing deteriorating hard tasks. Publish success by fixed deadlines and task-level regressions as additional safeguards.

Use paired comparisons on the same tasks and fixtures. Start deterministic compatibility checks with one fixed decoding profile; for stochastic finalists, plan three independently seeded repetitions per task unless the pilot justifies a different preregistered design. For the completion curve, average repeated-run completion indicators within each task, average tasks within each category, and apply the frozen category weights. For acceptance and normalized cost, similarly average the corresponding run-level values within tasks. This gives each task its intended weight; do not average successful latencies first or count repetitions as independent tasks. Cluster inference at the task/repository level. Reset task-specific state between fresh-task repetitions. Treat repetitions as observations nested within tasks and tasks as clustered within repositories or document families. Choose the resampling/interval method and seeds before confirmation. A hierarchical paired bootstrap is an implementable starting point; with few repositories, explicitly limit generalization and show per-repository results. If resamples fail to reach a required quantile, uncertainty must reflect that instead of discarding those samples or assigning them an infinite speed benefit. A conservative prespecified analysis treats an undefined ratio as failure to clear the speed gate and reports its frequency. Substantial uncertainty about reaching the median leaves the speed goal unestablished. Do not switch to a more favorable quantile afterward.

Use one-sided 95% bounds for the declared decision gates and label descriptive intervals separately. For the project speed claim, the lower one-sided 95% confidence bound of the primary ratio must reach 2.0. A point estimate of 2.0 with an interval crossing 1.0 is inconclusive. A lower bound above 1.0 but below 2.0 supports a measured improvement, not the full 2× goal.

For quality, the lower one-sided 95% bound of proposed-minus-conventional accepted rate must be above minus 2 percentage points. Report overall, coding, and general estimates; the general-assistance claim needs its own sufficiently powered confirmation, not merely a pooled coding result. Critical execution invariants are separate and cannot be traded for this margin.

The initial 240-case panel is a qualification and variance-estimation panel, not a promise of sufficient power. As an illustrative independent-pair calculation, 10% discordant success outcomes, no true quality difference, a 2-point noninferiority margin, one-sided 5% error, and 80% power require approximately 1,550 task pairs. Clustering, unequal weights, and different disagreement rates change this requirement; simulate the actual design from pilot data. This estimate is not a mandatory task count or a measured property of our models. Use pilot paired disagreements and repository variation to plan a fresh confirmatory sample for the 2-point quality margin and the speed effect. More seeds do not create more independent repositories. If the available sample cannot settle the claim, retain an explicitly provisional profile or expand the evaluation.

Freeze a finalist, baseline, primary condition, metrics, analysis, and sample size before confirmation. Do not repeatedly peek and stop when significance appears. Use a predeclared sequential method if adaptive sample size is necessary. Explore many mechanisms on development data, then confirm the selected configuration on fresh data; adjust for multiple separate confirmatory claims or restrict the claim family in advance. The overall release decision requires every declared gate to pass; it cannot substitute one successful gate for another.

## 6 Hardware states and resource accounting

Qualify actual 8 GB and 16 GB consumer laptops separately, initially without depending on a discrete GPU. Record CPU generation, cores, memory channels and speed where available, storage, OS, driver/runtime versions, and usable memory. A constrained run on a larger computer is useful supplementary evidence, not proof of behavior on a real 8 GB laptop.

Initial planning envelopes are 4 GiB on the 8 GB profile and 10 GiB on the 16 GB profile; they are provisional whole-application budgets. These include inference, auxiliary models, language servers, indexes, caches, and child tools. Determine each device's safe envelope from its normal OS/editor load before comparing candidate outcomes, then freeze it and apply it identically to competitors. The measured envelope may replace the planning allowance; do not choose it retrospectively to favor one model. Account for saved state and accelerator allocations without double-counting genuinely shared pages; driver allocations and file cache may sit outside an enforceable process limit. Report process-tree and system memory, shared/device allocation behavior, file cache, and paging; RSS or model-file size alone is insufficient. A configuration that repeatedly swaps or starves the editor fails the intended laptop profile even if it technically finishes.

Keep these conditions separate:

| Condition | State at the start |
| --- | --- |
| Process cold | Runtime/model unloaded; filesystem cache state recorded, not assumed cold |
| Model warm and task fresh | Runtime initialized, with no previous-task history, task-specific KV, cached tool result, prior answer, workflow result, or learned task memory |
| Reuse session | A declared chronological sequence in which both systems may retain their supported legitimate state |
| Sustained mixed session | At least 30 minutes of repeated tasks with controlled editor, indexing, and build activity |

Declare generic system-prefix caching explicitly and make the same option available to conventional baselines where supported; it must not conceal retained test-task state. Compilation, indexing, and reusable-procedure preparation belong in cold-start or amortization costs. Filesystem-cold measurements require a controlled method. Do not casually flush the user's OS caches. Record when a state cannot be established. Publish startup, model loading, indexing, and preparation cost separately and in cold/session totals. A warm result is never presented as cold-start performance.

Use balanced or randomized paired run order. Record thermal starting conditions and background work. Benchmark inference candidates serially on the same laptop; parallel benchmark agents would contend for the resources being measured. Repeat sustained comparisons on AC and battery as separate conditions where the platform permits, with power policies and battery state recorded. Restore comparable starting thermal conditions between paired sustained runs and plot performance over time rather than hiding decay in one average. Unsupported sensors remain missing values.

Measure memory during transitions, including two model states or buffers present during a swap/handoff. For cancellation, record acknowledgment, fencing of new effects, generation stop, and resource release separately. A quick UI acknowledgment cannot stand in for actual stopped work.

The main task timer starts when the request is submitted to the system, before admission and queue delay, and ends when it submits its final artifact after its own required checks. It includes context, model work, tools, repair, and fallback. Private offline grading uses that artifact and is timed separately. Setup outside the task is charged to cold-start and session/amortization reports. Core qualification runs locally after dependencies are prepared, with no remote inference or hidden service assistance.

Do not exhaustively cross every condition with every candidate. Use the model-warm/task-fresh condition for the primary whole-system comparison; evaluate cold and reuse conditions as separate predeclared panels, and run sustained sessions on finalists. Candidate order, panel selection, repetitions, and exclusion rules are frozen before confirmation.

## 7 How we isolate and combine mechanisms

Use a staged matrix. Qualify two fitting model profiles on the harness and pilot. Test each mechanism on the smallest workload that exercises its hypothesis, including a known hard or adverse case. Only finalists enter the expensive complete-system qualification. Reproduce a selected mechanism on a second compatible model before calling its benefit model-independent.

Begin with one-factor ablations. For the most likely interactions, use four cells: baseline, A alone, B alone, and A+B. Prioritize context selection with prefix reuse; source drafts with edit format; controller residency with main-model memory; and verification with retries. Report the interaction rather than multiplying the isolated speedups.

Inspect observable behavior on paired tasks: tool choices, files inspected, context actually supplied, generated artifacts, check results, repairs, fallback, and stop reason. Hidden reasoning text is unnecessary evidence. Capture minimal successful traces and failure traces so a speed difference can be connected to an execution difference.

A mechanism with no complete-task gain can still produce a useful result: higher correctness at the same deadline, lower peak memory at matched quality, or a clearly bounded specialist mode. Report the actual tradeoff. It does not count as meeting the project's speed goal unless the speed criteria also pass.

Prepare a release candidate by freezing runtime, artifacts, policy, routing thresholds, tool schemas, and evaluator versions. Run the whole combination against the selected conventional system. If an interaction loses, remove or condition the offending component and return to development. A collection of individual wins is not a qualified architecture.

## 8 First experiments and their contracts

| Experiment | Comparisons | Required instrumentation | First revision if it loses |
| --- | --- | --- | --- |
| Source-directed linear drafts | Ordinary decode, current n-grams, source drafts, and changed-span generation on the same target | Retrieval and verification time, proposed and accepted tokens, rejection locations, rollback cost, edit density | Shorter proposals, active-function index, boundary-aware matching, or route low-overlap edits to changed-span generation |
| Resident SmallThinker | Its supported normal runtime fully resident; sparse settings with full LM head; best fitting conventional model | Task quality, active/resident weights, total memory, compute phases, approximate-head status | Separate a model-quality failure from runtime overhead; retain resident sparse execution if SSD paging later loses |
| Tiny semantic controller | Deterministic dispatch, normal model, untuned controller, tuned controller, and tuned controller with fallback | Correct action and target, abstention, fallback, residency/loading, total accepted-task time | Narrow operations, supply resolved candidates, improve verified training coverage, or bypass the controller for explicit commands |

For source drafts, verify target state and rejection handling before measuring speed. Replay proposals with retrieval removed only to diagnose retrieval overhead, then restore it for the real comparison. Never count rejected tokens as useful throughput.

For SmallThinker, disable approximate LM-head prediction initially. Fully resident execution and constrained expert offloading are different conditions. The latter adds expert hit rate, missed bytes per token, prefetch waste, actual I/O latency, page cache, and overlap measurements. Compare constrained configurations against fitting resident alternatives. Published desktop or phone performance is not the measured laptop result.

For the controller, hold resolver, executor, source-version checks, and validator constant. It chooses among a narrow set of operations or abstains. Malformed or unsupported actions escalate before effects. Count all escalation and swap-back costs. Hold out phrasing, task templates, repositories, and unrelated requests; verified synthetic trajectories can support training, but teacher agreement alone is not a correctness label.

Model import and switching are prerequisite experiments: two GGUF profiles must advertise truthful capabilities, obey stop/cancel behavior, and resume from logical task state after an incompatible cache or failed load. Save task progress independently of model KV. Never replay a completed mutation merely because model state was lost.

## 9 Turning failures into tested revisions

A negative result applies to a recorded model, runtime, workload, hardware profile, and policy. Preserve that result. Determine whether the failure is an implementation defect, unsupported semantics, insufficient model capability, bad evidence, a resource bottleneck, workload mismatch, or unresolved statistical uncertainty.

Use this sequence: preserve the run → state a falsifiable cause → isolate it with the smallest diagnostic → predeclare one change and its expected effect → test the revision → repeat the complete comparison on fresh confirmation cases. Synthetic traces and oracle-quality evidence are diagnostic controls; their results cannot replace realistic end-to-end results.

| Observed failure | Diagnostic question | Plausible revision |
| --- | --- | --- |
| Source drafts are slower | Is retrieval expensive, acceptance low, or batched verification inefficient? | Bound the index, shorten drafts, use linear proposals, or restrict the mode to source-heavy edits |
| Workflow reuse is stale or costly | Are dependencies missing, or do guards cost more than replanning? | Compile smaller subflows, widen dependencies, cache only pure evidence, and replan unresolved decisions |
| SmallThinker offloading stalls | Are missed bytes, random I/O, or wasted prefetch beyond the storage budget? | Resize the hot set, bundle reads, reduce competing I/O, or retain fully resident sparse inference |
| Tiny controller chooses plausible wrong actions | Does the reference model also fail, or is conversion/template handling wrong? | Fix compatibility, narrow the vocabulary, supply semantic candidates, add verified examples and abstention |
| Code memory finds misleading neighbors | Is the representation stale, the index inaccurate, or token mixing too strong? | Rebuild for the deployed model, preserve provenance, gate retrieval, reduce the bank, or use LSP candidates |
| Document adapters lose details or contaminate later tasks | Is compression insufficient, conversion incorrect, or state isolation broken? | Narrow the document scope, preserve exact-source retrieval, validate matrices, reset adapter-dependent state |
| Diffusion needs too many rounds | Is the problem output length, unnecessary recomputation, or inadequate quality at short schedules? | Bound the patch, use realistic expansion, optimize measured hot operations, or retain autoregression for that regime |
| Adaptive recursion loses at batch one | Are routing/cache updates expensive, or is coding capability inadequate? | Fix state semantics, test fixed recursion, or use a narrower specialist role |
| Engram-style memory memorizes or interferes | Is the gate unused, overactive, or learning only training examples? | Change the module location, narrow its domain, adjust training controls, or keep external retrieval |
| Dynamic precision fails | Is the bottleneck unpacking, sensitive layers, policy cost, or incompatible model state? | Keep sensitive layers at higher precision, select at task boundaries, or retain a fixed mixed-precision profile |
| Hardware handoff loses | Do synchronization, conversion, copies, or bandwidth contention erase faster prefill? | Use one coarse boundary, one runtime, compatible shared buffers, or a long-prompt-only policy |
| Solver-backed repair fails | Is the specification wrong, grammar incomplete, or search too broad? | Narrow the hole, correct language semantics, add type constraints and counterexamples, retain alternative productions |

Treat stale edits, corrupted state, and incorrect effect replay as correctness defects before resuming speed promotion. More caching or a looser test is not a workaround for an invalid result.

The default branch budget is one diagnostic cycle and two meaningfully different repair attempts, followed by confirmation, a narrower supported regime, or a pause. Extend that budget when new evidence supports a distinct testable cause. A pause names a reopening condition such as a compatible state-export API, a better checkpoint, or a measured I/O improvement.

A narrowed mode needs a routing rule chosen on development data. Charge the router, its mistakes, fallback, and switching overhead. Selecting only the successful hidden tasks after the run is not a valid specialist result.

Keep an experiment ledger with the original hypothesis, failed evidence, diagnosis confidence, revision, new costs, confirmation data, and decision. The original goal remains recorded as unmet if the revision achieves a different tradeoff. This protects useful learning without moving the success criteria after seeing the answer.

## 10 Minimum measurement harness to build

Use the existing project's language when practical. The following layout specifies responsibilities, not a mandatory Python rewrite:

```text
bench/
  schemas/                 task run event result contracts
  tasks/                   visible fixtures and task manifests
  evaluators/              isolated acceptance checks
  adapters/                conventional and proposed systems
  runner                   isolation timing limits and capture
  compare                  paired statistics and reports
  tests/                   runner evaluator and state tests
artifacts/<run_id>/         immutable evidence package
```

The system adapter implements probe, prepare, execute, cancel, and close. Probe reports actual capabilities. Prepare establishes a declared model/cache condition. Execute receives the task and a controlled tool dispatcher and emits events. Cancel fences new effects and stops work where supported. Close reports cleanup outcomes. The harness owns timing, limits, fixture reset, private evaluation, and artifact capture.

A task manifest contains its ID and revision; repository/fixture, request, and evaluator hashes; language and category; required capabilities; initial user changes; allowed files and effects; information boundary; deadline; output contract; and acceptance checks. Different models may render different faithful templates, but the visible request and task information stay comparable.

A run manifest records CPU/GPU/NPU, usable RAM, OS/drivers, storage, power mode, background workload, runtime build, model/tokenizer/template hashes, quantization, state precision, context limit, thread/offload settings, policy and tool-schema hashes, retrieval/index versions, adapter identities, random seeds, order, deadlines, and cold/warm definitions. Record requested and effective settings separately. Canonicalize configuration before hashing.

Every event has run/task/attempt IDs, a parent event, type, monotonic timestamp, artifact references, source versions, status, and optional resource samples. Include load, context preparation, prefill, decode or denoising, retrieval, cache validation, tool work, edits, visible checks, repair, fallback, cancellation, and cleanup. Parallel timings retain their dependencies; sum elapsed critical-path time rather than all worker durations. Store large inputs and outputs as hashed artifacts.

Every result contains outcome, final artifact, validator evidence, elapsed time, deadline, stop reason, attempts, model/tool calls, accepted/drafted/rejected token counts where meaningful, memory peaks, paging, optional measured energy, and any human intervention. Missing telemetry is null, not zero.

Outcomes distinguish accepted, wrong/incomplete, timeout, blocked capability, cancelled by the test, and invalid harness run. An answerable in-scope task blocked by our system counts against its completion rate. Harness defects may justify rerunning the affected pair under a documented rule; retain originals and do not label model or runtime failures as invalid experiments.

The candidate has no access to the hidden evaluator during a run. Enforce this with the runner's filesystem/process boundary; putting tests in an ignored directory or a separate git worktree is insufficient. Offline acceptance grading is measured separately from product latency. Real checks the product performs are included in latency. A final artifact that fails hidden acceptance remains a failure even if its visible tests passed.

Finalize packages with checksums, raw events, manifests, outputs/diffs, visible test logs, private grading records, exclusions, and exact reproduction commands. Store failures as carefully as wins. Correcting an evaluator creates a new evaluation revision referencing the old run; never overwrite historical results.

## 11 Build gates and first deliverables

| Gate | Concrete deliverable | Exit condition |
| --- | --- | --- |
| Harness integrity | Fake adapter, fixture reset, monotonic events, deadlines, cancellation and cleanup | Correct accounting under success, failure, overlap, interruption, and missing telemetry |
| Evaluator integrity | Known-good and deliberately wrong outputs for the eight fixtures | Checks accept intended alternatives and reject false-green or out-of-scope results |
| Conventional baseline | A pinned local runtime and strong simple agent, with complete run packages | Two compatible model profiles run and switch truthfully; unsupported behavior is explicit |
| Development pilot | The 60 cases, baseline tournament, hardware profiles, and power/run-cost estimates | Candidate policies, deadlines, comparators, metrics, and confirmation sample plan frozen |
| First novelty trials | Source drafts, resident SmallThinker, and controller contracts | Each has a controlled result, diagnosis of losses, and a decision supported by traces |
| Useful coding system | Bounded context, edits, visible checks, source-version protection, cancellation | A real coding task finishes with an inspectable diff and preserved user changes |
| Qualification | Initial 240-case panel, fresh confirmation expansion as required, integration ablations | Goal claims follow their statistical and capability gates; inconclusive findings remain inconclusive |
| Sustained release check | Mixed interactive sessions on claimed laptop profiles | No unresolved critical execution defect; memory, responsiveness, and sustained results remain within requirements |

Run useful-system development and experimental branches in parallel after harness integrity. Build only the interfaces required by the first experiments; a universal plugin framework is not a prerequisite. Share model/tool fixtures and traces so diagnosing one branch improves the others.

The first implementation milestone is an executable measurement harness and conventional baseline, not a polished UI. It must produce an honest result for a passing task, a wrong answer, a timeout, a stale edit, and a cancelled task. The first performance milestone is a reproducible comparison with enough evidence to decide whether one novelty branch deserves further investment.

Estimate run time from the pilot before scheduling large sweeps. Expand independent tasks and repositories when quality uncertainty is the issue; repeat a smaller set when timing noise is the issue. Do not purchase statistical confidence by counting repeated executions of the same task as new tasks.

A release profile records exactly which hardware, models, languages, task regimes, and optional mechanisms qualified. An 8 GB result and a 16 GB result may select different models and settings. A claim for both tiers requires evidence from both; a memory cap on a larger machine supports an emulation claim only.

## 12 How results will be reported

Every comparison begins with the task and resource scope, the selected baseline, and the claim tested. Show accepted counts and denominators, quality differences and intervals, the completion-time curve, the primary speed ratio, deadline-penalized cost, cold and warm behavior, memory and paging, and failures by category. Include energy only with its measurement method.

Publish four paired outcome groups: both systems succeed, conventional only succeeds, proposed only succeeds, and neither succeeds. Show representative artifacts and traces from all four. Latency among joint successes is useful diagnosis, but cannot replace the all-task comparison.

For each mechanism, state one of: promoted to the tested profile; useful only in a named regime; promising but not yet confirmed; revised and awaiting fresh confirmation; or paused with a reopening condition. Include the engineering and preparation cost of a custom runtime, training pass, index, or adapter, and the reuse needed to amortize it.

Keep project-level success distinct from an experimental result. A 2× result on repeated renames does not establish a 2× general coding assistant. A high-quality slower model may improve the capability frontier while missing the speed goal. A sound negative result can direct the next experiment without becoming a performance claim.

This contract adds explicit success and revision rules to the existing [mechanism research](architecture.md). It specifies what to build and test next. The execution environment remains offline, so the harness, benchmark fixtures, and measured result packages are implementation deliverables rather than completed artifacts.
