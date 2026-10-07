# Local AI control and coding mechanisms research

> Research snapshot: 7 October 2026. [Original Page](https://chatgpt.com/space/page_53121bd9c55081918274cf82377c1993). This document records evidence, hypotheses, and proposed experiments. Implemented scope is described in the [repository README](../../README.md); proposals are not measured product capabilities. The [evaluation contract](evaluation-contract.md) governs qualification where older research language differs.

This dossier specifies the control and coding mechanisms for a local GGUF assistant on 8–16 GB consumer laptops. Coding is the first demanding workload; retrieval, document work and general tools use the same task machinery. It supports the [master architecture and roadmap](architecture.md).

Research date: **7 October 2026**. This is a design and experimental program, not an implementation or a measured laptop result. **Evidence** paragraphs describe published work or current official implementations. **Proposed contract**, **cost and failure modes**, and **experiment and gate** paragraphs are the architecture proposed here. Mutable implementation links must be pinned to a tested revision during implementation.

The recommendation is to minimize repeated model decisions and copied output, preserve useful process state, and make every accepted result traceable to the source and checks that produced it. The existing application and repository have not been inspected: retain a working stack initially. Rust, SQLite, Tauri, a language server and a sophisticated planner each need a demonstrated job; changing the application language does not itself accelerate inference kernels.

## 1 Measure accepted work and keep a strong simple baseline

**Mechanism.** Optimize end-to-end task completion at a controlled success rate. Raw output tokens per second and fast first-token display are diagnostic measurements. They are inadequate proxies for a correct edit, a reliable answer or a completed action.

Use the accounting model:

`Ttask = queue + model load + context assembly + prefill + decode + tool work + verification + repair` is a serial accounting model. For overlapping phases, use their critical-path elapsed time rather than summing worker times.

Record human correction separately when evaluating accepted results. Record unsuccessful and timed-out attempts, rather than dropping them from the latency sample. For failed tasks, keep the actual consumed time and the outcome; do not invent a completion time. Report success by deadline alongside latency among successes and total compute consumed.

**Evidence.** The original SWE-agent shows that its agent–computer interface can materially affect coding performance. Its experiments use strong hosted models, so its preferred observation sizes are not universal laptop constants. The current mini-SWE-agent is a useful counterweight: a small Python scaffold and a basic shell interface can be a strong baseline. These projects demonstrate that interface design matters and that elaborate orchestration needs an ablation against competent simplicity. [SWE-agent paper](https://arxiv.org/html/2405.15793v3), [official ACI documentation](https://swe-agent.com/0.7/background/aci/), [mini-SWE-agent implementation](https://github.com/SWE-agent/mini-swe-agent).

**Proposed contract.** Each task records input and source snapshot IDs, model/runtime profile, prompt and generated token counts, phase timings from a monotonic clock, checker outcomes, cancellation state, peak memory and outcome classification. Store logs as bounded artifacts with hashes. Separate model prompt text from full evidence: a clipped observation must point to the retrievable complete result.

**Cost and failure modes.** Instrumentation can perturb a constrained device. Buffer fine-grained events and persist important state transitions; avoid a database commit per token. Warm caches, cold starts, plugged-in operation and battery operation are separate conditions. Thermal steady state needs a sustained run; a brief burst is insufficient.

**Experiment and gate.** Establish one minimal local assistant with the chosen GGUF, a narrow shell/edit tool set and bounded tests. Compare subsequent mechanisms with the same model, quantization, prompt budget, task set and verification policy. Accept improvements only on the success–time–memory frontier, including tail latency and failed work. Repeat cross-device before claiming that the result generalizes to consumer laptops.

## 2 Compile short typed plans only where they remove decisions

**Mechanism.** A model can describe several known operations once, while the host handles references, scheduling and result bookkeeping. The useful boundary is a short plan ending at an observation that could change the strategy. An explicit single operation bypasses a planning turn. Ambiguous debugging still needs observation and replanning.

**Evidence.** LLMCompiler separates planning, dependency resolution and execution, and can execute independent tools while further tasks are planned. Its benchmark mix and GPT/Llama-2-70B setting do not predict speed on one small local model. The transferable idea is fewer orchestration turns and explicit dependencies; its reported speedups are not local-laptop forecasts. [Paper](https://arxiv.org/html/2312.04511v3), [official implementation](https://github.com/SqueezeAILab/LLMCompiler).

**Proposed contract.** Use a versioned intermediate representation:

```text
Plan { schemaVersion, snapshotId, nodes[], stopCondition }
Node { id, operation, typedArguments, dependsOn[] }
ToolContract {
  argumentSchema, outputSchema, effectClass,
  resourceClass, timeoutPolicy, resolveAccessSet,
  preconditions, resultValidator
}
EffectClass = readOnly | stagedWrite | externalEffect
```

The host supplies effects, limits and verification policy. A model cannot mark its own shell command safe, choose unlimited resources or declare a mutation independent. Validate operation names, argument types, reference targets, graph acyclicity and size limits before dispatch. Dependency validation is O(V + E); evaluating tool effects and resolving real source targets is additional work.

Permit streaming dispatch only for complete, validated read-only nodes whose access conditions are known. A plan prefix can omit a future conflict; defer mutation until its required plan boundary and snapshot are established. Tool observations are data, never additional host instructions.

**Cost and failure modes.** A long JSON plan can cost more decoding than the tool work. Schema-constrained output can still select the wrong action or omit a real dependency. Overlapping reads and writes require host-derived ordering. Unknown access sets require conservative serialization or discovery first. Tool-result references must be bounded and typed; expanding an enormous result into an argument is not free.

**Experiment and gate.** Compare direct action, ordinary observe–act turns, whole-plan execution and a short-horizon hybrid on independent searches, dependent repairs, missing information and contradictory observations. Include plan generation, invalid-plan repair and wasted tools in cost. Adopt the hybrid only in task classes where it reduces completed-task time without increasing wrong operations or hidden failures. Cap plan nodes and replans using measured task budgets.

## 3 Treat small-model tool skill as a tested capability

**Mechanism.** Present the smallest useful tool vocabulary and examples for the current task. A compact model should select among dependable operations, with the host supplying argument constraints and tool prerequisites. Avoid loading a second permanent model merely to classify every request.

**Evidence.** TinyAgent fine-tunes small models for a fixed set of Mac assistant tools and uses ToolRAG to select tool context. Its evaluation checks generated plans against reference graphs. The official repository states that arbitrary added tools work only with its GPT path because released local models and ToolRAG were trained on the original tool set. This is evidence for specialized tool competence, not arbitrary plug-in competence. [Paper](https://arxiv.org/html/2409.00608v1), [official repository](https://github.com/SqueezeAILab/TinyAgent).

**Proposed contract.** A model profile records measured capabilities separately:

```text
CapabilityResult {
  modelHash, tokenizerAndTemplateId, runtimeBuild,
  capability, testSetVersion, passed, limitations
}
capability: chat | typedActions | FIM | editRegion | groundedAnswer
```

A new GGUF must pass a small local conformance suite before receiving tools. Validate semantic argument construction, missing-argument handling and refusal to invent tools. The task router first uses explicit user commands, file types and active application state. If tool retrieval is used, include prerequisite tools and allow a bounded catalog-expansion request.

**Cost and failure modes.** Tool selection can remove the one operation needed for the task. A syntactically valid action can still target the wrong file or account. Few-shot examples consume prefill and context. A GGUF container does not establish the model's chat template, FIM behavior or aptitude for the operation language.

**Experiment and gate.** Compare a full small catalog, deterministic task-specific catalogs and retrieved catalogs, measuring required-tool recall, plan validity, semantic action accuracy and total prompt/decode time. Adopt retrieval only when its overhead is repaid and required-tool recall remains adequate on held-out tasks. Keep unsupported capabilities unavailable rather than silently routing them through a brittle parser.

## 4 Schedule the whole laptop and start with one active generation

**Mechanism.** Use one foreground generation by default, releasing inference ownership while waiting for tools. Run independent low-cost reads concurrently. Admit CPU-heavy tests, builds, indexing and additional model work according to measured contention. A dependency DAG describes legal execution; it does not establish profitable parallelism.

**Proposed contract.**

```text
Job {
  id, taskId, epoch, priority, deadline, cancelToken,
  resourceClass, estimatedPeakMemory, sourceSnapshot
}
ResourceClass = inference | lightIO | cpuHeavy | indexMaintenance
Lease = measured resource admission for a bounded phase
```

Inference admission reserves the measured loaded-model footprint, configured context/KV state and transient peak, plus application and OS headroom. These are observations for a runtime profile, not weight-file-size arithmetic. Queue entries carry deadlines and cancellation epochs. Aging prevents indefinite background starvation; foreground interaction preempts or postpones maintenance where the backend permits.

The default queue has at most one admitted model-generation job. This is a starting policy, not a mathematical claim that batching is always worse. Test continuous batching separately if concurrent users or tasks become real requirements. Avoid extra models resident merely to maintain parallel agent identities.

**Cost and failure modes.** A build and CPU inference may both saturate memory bandwidth; allocating spare logical cores does not imply spare bandwidth. Conversely, serializing all I/O wastes time. Large prefills can delay a tiny interactive request. Report queue delay separately from runtime delay. Admission estimates can be wrong, so react to observed memory pressure and sustained throughput degradation. Kernel work may not be instantly preemptible.

**Evidence and interaction.** llama-server already has slot and batching machinery; an application scheduler should govern workload admission instead of assuming HTTP concurrency supplies fair, low-latency laptop behavior. [Server documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [server architecture](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README-dev.md).

**Experiment and gate.** Replay an interactive edit while a build and indexing job run: serial, unrestricted parallel, and admitted parallel. Measure task p50/p95, UI response, memory pressure and energy where available. Keep parallelism only when useful throughput improves within the foreground latency and memory budget. Do not claim power or thermal gains without device measurements.

## 5 Generate semantic uncertainty and let tools supply mechanical edits

**Mechanism.** Prefer a supported language-server refactoring, a bounded replacement or a model's supported FIM format when these reduce generated output and retain accuracy. The model selects intent and creates the genuinely new expression or region; software finds references and constructs the patch. Keep a whole-region rewrite path because some models handle that format better than intricate diff syntax.

**Evidence.** LSP defines rename and versioned document edits; the latter describe nonoverlapping edits against one source version. Position encodings require explicit handling and default to UTF-16 when no other encoding is negotiated. These are edit transport and semantic-tool contracts, not a guarantee of project behavior. [Rename](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.18/language/rename.md), [TextDocumentEdit](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.18/types/textDocumentEdit.md), [positions](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.18/types/position.md). Cursor's Instant Apply explores reusing unchanged code, but its hosted-model results do not establish a laptop speedup. [Official research](https://cursor.com/blog/instant-apply).

**Proposed contract.**

```text
Snapshot {
  repositoryId, baseCommit?,
  dirtyFileHashes, overlayVersions,
  buildConfigHash, dependencyLockHash, toolchainId
}
EditProposal {
  baseSnapshotId,
  edits[{uri, expectedRawByteHash, rangeEncoding, range, newText}],
  evidenceIds[], checkPlan
}
```

A Git commit alone is insufficient when working files or editor buffers are dirty. Resolve a symbol using the current language-server project and document version. Convert positions using the negotiated encoding. Check all preconditions before staging a batch. Never fuzzy-apply an ambiguous patch silently. Return a conflict requiring fresh context.

**Cost and failure modes.** Language servers and dependency analysis can be expensive on 8 GB. Start them on demand for the active project and measure reuse benefit. Rename can miss strings, reflection or external consumers; textual similarity does not establish symbol identity. Arbitrary AST rewriting is not a substitute for language semantics. Multiline changes may be temporarily invalid: lint after the intended edit group, not after each constituent operation.

**Concrete example.** For “Rename retryDelay to backoffDelay and cap it at five seconds,” resolve the intended symbol, stage the supported rename, inspect the actual delay expression and units, and ask for only the new expression or containing region. If evidence establishes milliseconds and intended nonnegative-delay semantics, a candidate might be `Math.min(computedDelayMs, 5000)`. The host applies the versioned edits and checks references and boundary behavior. If the value is seconds, a duration object, an async result or a different symbol, this candidate is invalid. Saved work consists of reference enumeration and unchanged source that the model no longer emits; the amount must be measured.

**Experiment and gate.** Compare full-file output, region rewrite, FIM and semantic-operation-plus-small-edit with the same model. Include Unicode, dirty buffers, overloaded names, missing language servers, string-based access and user edits during inference. Adopt a format per task class only when accepted-task time improves. Every stale or ambiguous application case must reject safely in the test suite.

## 6 Use compiler feedback before attempting token-level semantic masks

**Mechanism.** First supply concrete signatures, symbol candidates and fresh diagnostics. Then use bounded generate–check–repair. Consider a decoder-integrated monitor only when repeated invalid-symbol errors account for enough lost time to repay its serial overhead.

**Evidence.** Monitor-Guided Decoding uses static-analysis feedback to constrain next tokens, including API usage. Its main DotPrompts benchmark concerns partial Java method completion, with compilation and completion metrics; it does not establish general issue-resolution correctness. The reference implementation integrates with token/logit processing. Its transparency documentation acknowledges latency dependence and remaining logical/runtime errors. [Paper](https://arxiv.org/html/2306.10763v1), [implementation](https://github.com/microsoft/monitors4codegen), [logits processor](https://github.com/microsoft/monitors4codegen/blob/main/src/monitors4codegen/monitor_guided_decoding/hf_gen.py), [limitations](https://github.com/microsoft/monitors4codegen/blob/main/RAI_Transparency_Information.md).

**Proposed contract.** Every diagnostic result carries source snapshot, document/project version, checker identity and completion status. `CheckOutcome = pass | fail | unknown`; a timeout, stale analysis or unsupported language is unknown. Silence before analysis completes is not pass. LSP diagnostic capabilities differ by server, so negotiate and test the chosen server rather than assuming all implement pull diagnostics. [LSP diagnostic specification](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.18/language/pullDiagnostics.md).

A later monitor adapter needs `advance(token, snapshot)`, `allowedTokens()`, `checkpoint()`, `rollback()` and `unknown`. It must handle partial identifier tokens, tokenizer differences and stale semantic state. If analysis is incomplete, an empty allowed set must not silently mean that all continuations are invalid. Monitor checkpoints must roll back alongside rejected speculative tokens.

**Cost and failure modes.** Calling analysis in the token loop adds serial work and can erase decoding gains. Incorrect masks can remove a valid solution. Existing Hugging Face monitor code is not a drop-in HTTP feature for arbitrary GGUF models. Integration requires a compatible sampler or a runtime extension and backend testing. Compilation success remains weaker than behavioral correctness.

**Experiment and gate.** Run three levels on API-heavy edits: signature retrieval, signature retrieval plus fresh diagnostics, then experimental masking. Measure total completion time, behavior-check success, false exclusions, analysis time and generated tokens. Adopt masking only if it beats the simpler feedback path on held-out tasks under the same memory budget. Disable it by capability and language when unsupported.

## 7 Verify exact artifacts and bound repair by useful new evidence

**Mechanism.** Localize a change, generate a candidate, and run the cheapest checks capable of detecting its likely errors. Escalate verification based on dependency reach and risk. Repair only when feedback is actionable and remaining budget makes success plausible.

**Evidence.** Agentless separates localization, patch construction and validation/ranking. Its results use strong hosted models, and multiple candidate sampling does not become free when moved onto one local decoder. It motivates phase separation, not an unconditional pool of competing local agents. [Official implementation](https://github.com/OpenAutoCoder/Agentless), [paper](https://arxiv.org/abs/2407.01489). Self-repair research shows that gains depend on feedback quality and model capability; it does not justify an automatic critic loop after every answer. [Is Self-Repair a Silver Bullet](https://arxiv.org/abs/2306.09896).

**Proposed contract.**

```text
CheckRecord {
  artifactHash, sourceSnapshotId, checkerId, checkerVersion,
  commandOrOperation, environmentFingerprint,
  outcome: pass | fail | unknown,
  evidenceArtifactHash, scope, baselineComparison
}
RepairBudget {
  remainingWallTime, remainingModelTokens,
  remainingAttempts, repeatedFailureLimit
}
```

Record preexisting failures separately. A test must run against the same artifact that is presented or published. Mutating the patch after checks invalidates affected records. Generated tests can add useful cases, but cannot independently certify the model's own interpretation of a request. Keep trusted evaluation tests outside the candidate's writable scope.

A failure fingerprint combines the patch identity, normalized diagnostics and failing test identities. If a retry produces no meaningful change and the same failure, stop or change the information source. Preserve the best inspected candidate and its limitations. A deadline expiry produces an incomplete result, never a manufactured pass.

**Cost and failure modes.** Full test suites can dominate latency; targeted checks can miss regressions. Maintain a dependency-aware check policy and periodic broader evaluation. A failing test may reveal a bad test, an environment problem or a wrong patch; do not blindly edit whichever file makes the red mark disappear. Unbounded retries and self-generated critiques can consume more time than they save.

**Experiment and gate.** Compare zero, one, two and four repair attempts under equal total budgets, including check time. Compare diagnostic feedback with an ungrounded critique and simple resampling. Fit stopping policy only after collecting outcomes by task class. A proposed marginal-value rule uses measured extra success probability per added time; the model's confidence is not that probability. Adopt the smallest budget on the desired success/latency frontier.

## 8 Reuse dependency-tracked work and keep applicability separate from similarity

**Mechanism.** Reuse a result only when its real inputs still match. Reuse a successful procedure as parameterized steps whose preconditions and outcome checks run again. Semantic similarity can find a candidate procedure; it cannot establish that an old patch or result applies.

**Evidence.** Build Systems à la Carte separates scheduling from rebuild decisions and exposes the importance of dependencies. TypeScript's incremental mode illustrates persistent project-graph reuse in an existing compiler. These support borrowing mature incremental tools rather than rebuilding a second incomplete dependency system. [Research](https://www.microsoft.com/en-us/research/publication/build-systems-la-carte/), [TypeScript incremental](https://www.typescriptlang.org/tsconfig/incremental.html).

**Proposed contract.**

```text
CacheEntry {
  operationAndVersion, canonicalArguments,
  dependencyHashes[], relevantEnvironmentHash,
  resultArtifactHash, validationStatus, freshnessRule
}
Recipe {
  version, requiredCapabilities, parameters,
  preconditions, steps, expectedPostconditions
}
EvidenceRef {
  artifactHash, sourceLocator, sourceVersion,
  byteOrSemanticSpan, extractionVersion
}
```

Maintain separate stores for source/index data, pure tool results, inference-prefix state and procedures. Cache keys for one are not valid keys for the others. Model-state compatibility also depends on the model, tokenizer/template and inference configuration. Treat a changed lockfile, build configuration or toolchain as an invalidation signal until the relevant dependency closure is established.

**Cost and failure modes.** Hashing an entire repository for each action wastes I/O. Use change notifications to identify candidates, verify their content, and reconcile missed events in idle work. Modification time alone is not a content guarantee. Index changed files in bounded batches; large scans pause during foreground inference. Do not cache a side effect as though it were a pure function. A successful old workflow may rely on an unstated environment assumption.

An FTS index is an optional retrieval component with explicit freshness and deletion behavior. It is not semantic truth, and an embedding model is not required merely because retrieval exists. Store source references so an answer can identify its supporting version.

**Experiment and gate.** Replay unchanged tasks, edit an unrelated file, edit a dependency, change build flags/lockfiles, rename a source and simulate lost watcher events. Measure avoided work and maintenance cost over a full session. Known stale dependencies must invalidate; uncertain dependency scope must trigger recomputation. Adopt recipe promotion only when repeated successful replay pays back capture and maintenance cost.

## 9 Make cancellation and speculative UI requests real resource operations

**Mechanism.** Every request has an identity, source version and cancellation epoch. An obsolete preview is removed before it starts or cancelled if already running. Hide stale text immediately, but report runtime cancellation complete only when computation and descendants have actually relinquished resources.

**Evidence.** Current llama-server development documentation distinguishes ordinary socket-bound streaming from optional resumable streaming. With a conversation ID in resumable mode, a disconnected client does not by itself stop generation; explicit stream cancellation is available. The adapter therefore must negotiate and test its selected mode. This is version-specific behavior that must be pinned. [Official server documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README-dev.md).

**Proposed contract.**

```text
GenerateRequest { id, taskId, epoch, snapshotId, budget, streamingMode }
StreamEvent { requestId, epoch, sequence, type, payload }
CancelState = requested | acknowledged | released | failed
```

Reject late events from old epochs before they can mutate task state. On cancellation, remove queued descendants, signal running tools, terminate their process groups after a bounded grace period, and reconcile uncertain effects. Acknowledging the UI command is distinct from observing an inference slot free. An adapter unable to cancel reliably must expose that limitation.

For inline completion, maintain one latest eligible request per editor location. The cache and response identity include relevant prefix/suffix and document version. Debounce according to measured service time and user activity; no universal interval is established. Preview generation never applies edits automatically. Acceptance rechecks its source version.

**Cost and failure modes.** Unbounded per-keystroke speculation creates a backlog and drains the battery. Aggressive cancellation can repeatedly discard expensive prefills. A server restart may recover a stuck request but destroys warm state. Shared-process cancellation must not kill unrelated work. A request ID reused after restart can misattach a late result; include a runtime incarnation or equivalent uniqueness.

**Experiment and gate.** Inject cancellation during queued work, prefill, decoding, tools and verification; disconnect/reconnect the UI; restart the sidecar. Verify stale outputs cannot apply, tool descendants terminate and a new foreground request starts within the chosen cancellation budget. Measure wasted compute per accepted suggestion, not just suggestion latency. Adopt proactive previews only if their acceptance benefit exceeds that cost.

## 10 Separate staging, verification and publication with recoverable effects

**Mechanism.** Stage code changes in an isolated working area, verify the staged artifact, then present or publish that exact artifact. Persist operation state around effects so a crash can be reconciled. A transaction in a metadata database does not make multiple filesystem writes atomic.

**Evidence.** Git worktrees provide separate working directories and indexes while sharing repository data. They are convenient task isolation, not an execution sandbox. Bubblewrap is one Linux isolation building block; the actual protection depends on how it is invoked. These are not a cross-platform sandbox specification. [Git worktree documentation](https://git-scm.com/docs/git-worktree), [Bubblewrap security model](https://github.com/containers/bubblewrap/blob/main/README.md).

**Proposed contract.**

```text
OperationRecord {
  id, taskId, effectClass, inputsHash, expectedStateHash,
  state: proposed | staged | checked | published | uncertain | cancelled,
  artifactHashes[], checkRecordIds[], idempotencyKey?
}
```

For a local patch, validate all source preconditions, stage the complete edit group, record the resulting artifact hash, then check it. Applying back to the user's working tree requires a fresh conflict check against current files. File replacement can be atomic on suitable local filesystems, but multi-file publication needs a journal or a conflict-aware application strategy; do not claim cross-file atomicity from a series of renames.

On startup, inspect incomplete operations and actual artifacts. Retry pure reads freely within budget. Reconcile staged writes by their hashes. For an external effect, retry only when its operation supplies an idempotency contract or the actual outcome can be determined. Otherwise surface an uncertain outcome.

**Cost and failure modes.** Builds and tests execute repository code. A worktree alone does not limit access to credentials, the network, sibling directories or other processes. Choose OS-specific process and filesystem isolation once the target platform is known. Mount shared dependency caches read-only where feasible; separate writable build outputs by task. Resource limits must cover child processes as well as the immediate command. Isolation startup and duplicate dependencies can be costly on small disks and RAM.

**Experiment and gate.** Kill the app before and after each state transition; interrupt a multi-file edit and concurrent user edit; run a tool that spawns children or exceeds its limits. Verify no partially checked artifact is presented as complete and no uncertain external effect is blindly repeated. Require explicit, reproducible recovery behavior before enabling unattended writes.

## 11 Start with the narrowest runtime adapter and let profiling decide embedding

**Mechanism.** Use a pinned existing inference runtime through a small adapter. A llama-server sidecar is a practical first candidate because it exposes the existing model/backend implementation and contains runtime crashes. Direct libllama embedding is a later choice for required sampler access or a demonstrated transport/control bottleneck.

**Evidence.** llama.cpp supplies the C/C++ runtime and server. The current development documentation explicitly treats parts of its internal tool endpoint as unstable, so application actions should live behind the application's own contract. Tauri uses the operating system WebView and supports sidecar packaging; those architectural facts are not measurements of this application's RAM or battery use. [llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md), [development architecture](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README-dev.md), [public C API](https://github.com/ggml-org/llama.cpp/blob/master/include/llama.h), [Tauri architecture](https://tauri.app/concept/architecture/), [Tauri sidecars](https://tauri.app/develop/sidecar/).

**Proposed contract.**

```text
Runtime.probe(modelProfile) -> tested capabilities and resource estimate
Runtime.load(modelProfile, resourceBudget) -> session
Runtime.generate(session, request) -> bounded event stream
Runtime.cancel(requestId) -> observed cancellation state
Runtime.health() -> model identity, active work, memory, timings
Runtime.unload(session) -> completion
```

Negotiate FIM, chat template, schema subset, cancellation semantics and timing fields. Pin the runtime build and validate a small compatibility suite before upgrade. The app owns tool validation, scheduling and filesystem effects; a model-serving endpoint does not become the workflow engine.

**Cost and failure modes.** An FFI boundary creates responsibilities for lifetimes, threading, sampler ownership, tokenizer/template compatibility and backend packaging. A crash can take down the app. Conversely, loopback transport may copy payloads or complicate token-level control. Measure both if that cost is material. Do not assume switching a Python coordinator to Rust improves a workload dominated by native decoding or builds.

SQLite can hold task metadata and local search when those requirements exist. WAL supports readers with a writer, but still has a single writer; keep transactions short and avoid holding one across inference or tests. A file-backed event journal can be an adequate initial baseline if the existing app has no database. [SQLite WAL](https://www.sqlite.org/wal.html), [FTS5](https://www.sqlite.org/fts5.html).

**Experiment and gate.** First profile the existing application's idle footprint, request assembly, serialization, runtime service time and UI. Compare a minimal direct adapter with additional wrappers. Consider FFI only if it exposes a required feature or yields a meaningful end-to-end benefit at equal reliability. Choose Rust/Tauri based on measured overhead, distribution needs and existing code—not as a mandatory rewrite.

## 12 Adopt mechanisms in a sequence that exposes causal benefit

The following are proposed experimental gates, not established benchmark results. Before implementation, define task acceptance, permissible quality loss, device limits and timeout behavior. Keep those fixed while comparing alternatives.

| Stage | Controlled comparison | Primary measurements | Adoption gate |
| --- | --- | --- | --- |
| A Baseline and runtime contract | Minimal local assistant, pinned GGUF/runtime, cold and warm starts | Success by deadline, phase times, peak memory, cancellation release | Repeatable results and no hidden failed work; resolve adapter capability mismatches first |
| B Semantic edits | Full-file output versus bounded rewrite versus supported semantic action | Accepted-task time, output tokens, wrong/stale edit rejection, relevant behavior checks | Faster accepted work with acceptable quality; all constructed stale/ambiguous cases rejected |
| C Incremental reuse | Cold work versus dependency-aware warm work | Reused work, invalidation accuracy, index maintenance cost | Session-wide net savings; every known changed dependency invalidates |
| D Short plans | Direct/observe–act versus validated short DAG | Planning tokens/time, tool latency, dependency errors, replans | Net benefit on selected task classes; otherwise keep the simpler path |
| E Laptop admission | Serial versus unrestricted parallel versus resource admission | Foreground p95, useful throughput, memory pressure, wasted background work | Better throughput within foreground and memory budgets |
| F Feedback and repair | Diagnostics, bounded repair budgets, then optional token masks | Behavioral success, total time, unknown outcomes, false exclusions | Cheapest mechanism on the chosen success/latency frontier |
| G Proactive UX | Demand-only versus debounced previews | Time to accepted suggestion, acceptance rate, wasted tokens/energy, cancel release | User benefit exceeds speculative work under battery and interaction budgets |
| H Packaging/embedding | Existing stack/sidecar versus proposed replacement | End-to-end cost, idle/peak memory, crash recovery, installation | Required capability or measured improvement justifies migration and maintenance |

Use an exploratory set containing straightforward mechanical changes, localized bug fixes, API-heavy changes, multi-file changes, underspecified tasks, stale-source races, cancellation and recovery. Keep a held-out set for adoption decisions. Paired tasks and repeated runs reduce noise; deterministic decoding does not make the whole system deterministic.

Report results per class and per device, with uncertainty, rather than a single blended speedup. Averages can hide an unusable tail. Check both a short interactive workload and sustained mixed work after the device reaches a stable thermal regime. Golden tests and evaluator decisions must remain outside the candidate agent's mutable context.

The first two substantive experiments should be **semantic operation plus bounded generation** and **correct incremental reuse**, after the minimal runtime baseline exists. They directly reduce repeated model or tool work without requiring new model training or sampler surgery. Short-horizon planning is next where several operations are already known. Token-level monitoring and an FFI runtime are contingent research branches.

## Research boundaries and corrections to common assumptions

| Claim to avoid | Evidence-based replacement |
| --- | --- |
| A planner's published speedup transfers to this laptop | Tool/API parallelism and large-model benchmark conditions differ; measure total local task time including planning |
| Every GGUF can use arbitrary tools after a prompt change | Container compatibility and semantic tool competence are separate; test both |
| One resident model means no concurrency anywhere | Cheap I/O and compatible tools can overlap; model and CPU-heavy work need admission measurements |
| A valid typed action is a correct action | The host still validates targets, preconditions, effects and outcome evidence |
| A language-server rename guarantees behavior | It supplies supported semantic edits within its project understanding; dynamic/external uses still need checks |
| Compilation means the requested fix is correct | Compilation is one check; behavior and acceptance require separate evidence |
| A test passed once, so a similar patch can reuse the result | Checks attach to exact artifacts and dependency/environment inputs |
| Closing the UI stream cancels inference | Streaming mode and runtime behavior determine that; confirm actual resource release |
| Git worktrees or SQLite transactions provide a sandbox or cross-file atomicity | They solve different problems; isolation and recovery need explicit contracts |
| Rust or a native UI is inherently the speed breakthrough | Native inference kernels and the task workload usually determine the dominant cost; profile the control/UI overhead |
| More autonomous agents means more useful intelligence per second | Extra prompts, resident models and verification consume the same constrained machine; parallelism must earn its resource cost |
| A clever reuse layer can skip all fresh verification | Reuse requires proven applicability and a check policy; uncertain dependencies force fresh work |

The research supports a concrete direction: **small, capability-tested models selecting compact operations; deterministic tools doing known work; dependency-tracked reuse; and explicit budgets for generation, checking and speculation**. It does not establish a numerical “godlike” speed claim or a universally optimal model, language, context size, concurrency level or stopping policy. Those are outputs of the controlled device experiments above.
