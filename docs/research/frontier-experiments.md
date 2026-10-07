# Frontier experiments: unconventional local AI systems and model architectures

> Research snapshot: 7 October 2026. [Original Page](https://chatgpt.com/space/page_3c20f71186c881919a7fb187e6002a5b). This document records evidence, hypotheses, and proposed experiments. Implemented scope is described in the [repository README](../../README.md); proposals are not measured product capabilities. The [evaluation contract](evaluation-contract.md) governs qualification where older research language differs.

Research date: 7 October 2026. This is an experimental program for coding-first local AI on consumer laptops, especially 8–16 GB machines. It extends the [master architecture and roadmap](architecture.md). The main GGUF path remains useful while specialized runtimes, model internals, and learned components receive real prototype time.

The [version 1 project goals and comparison protocol](evaluation-contract.md) governs how these branches are built, compared, diagnosed, revised, and promoted. It defines the conventional baselines, primary 2× median completion goal, fidelity requirements, task suites, memory envelopes, and confirmation rules. A mechanism may earn a narrower useful role without being counted as achieving the full project goal.

These are researched mechanisms and proposed experiments, not measurements on the user's laptop. Published results belong to their stated hardware, workloads, and implementations. All local budgets, effort estimates, and promotion criteria below are proposed engineering choices. No training jobs, purchases, installations, or product builds were performed for this dossier.

The ambition is to remove whole categories of repeated work, reduce bytes moved per useful operation, and place expensive reasoning only where it changes the answer. Unusual approaches should be rejected by a cheap, informative test—not by their unfamiliarity. Equally, a promising paper does not earn an integration project before its central assumption survives that test.

## 1. Experimental contract and architecture

Every branch reports accepted-task latency, task success, peak process and system memory, cold and warm behavior, and sustained behavior. Tokens per second is a diagnostic. For code, accepted completion includes selecting the right target, applying the intended change, and passing trusted checks without damaging unrelated behavior. Failed attempts, fallbacks, loading, retrieval, conversion, verification, and returning to the default model belong in the cost.

Use matched prompts, source snapshots, available information, output requirements, hardware settings, and wall-clock budgets. Record differences that cannot be matched. For a new model, separate the comparison against the best practical alternative from ablations that identify why the new mechanism helps. Do not multiply speedups from independently measured papers: their bottlenecks and overheads overlap.

The runtime contract needs capability discovery, not a false promise that every backend implements the same internals. The common surface covers cancellation, memory estimates, tokenization, text generation, structured outputs, state identity, and telemetry. Optional capabilities cover draft verification, hidden-state extraction, logit intervention, adapter lifecycle, block denoising, recurrent-state snapshots, and state transfer between backends. A backend declares unsupported operations. GGUF remains a first-class interchange path; custom operators, attention semantics, or training-dependent behavior require a corresponding runtime.

Experiments must label their correctness contract. Exact target verification can preserve a target distribution when the complete acceptance algorithm and target state are correct; it does not imply identical seeded samples across implementations. Approximate precision changes, sparse LM-head prediction, learned early exit, and lossy memory instead require quality evaluation. A compiler or solver guarantees only its actual semantics and encoded contract.

Each branch gets a reproducible baseline, a bounded prototype, an explicit memory budget, a success criterion, and a stopping condition. Choose mechanism-specific thresholds from the workload's needs and measured variance. Use held-out repositories/task families and paired evaluations; a tiny sample with zero failures cannot establish a narrow noninferiority margin. Preserve a working fallback, but count how often and how expensively it runs.

## 2. Source-directed draft generation

**Hypothesis and evidence.** Existing code can generate proposals more cheaply than a second neural model. [REST](https://github.com/FasterDecoding/REST) retrieves continuations and builds candidate trees; its A6000/96-CPU-core setting does not establish laptop speed. [RACER](https://github.com/hkr04/RACER), an ACL 2026 Findings project, exposes a C++ matching automaton and CPU-only alignment tests, while complete inference examples use CUDA. Its SGLang integration does not make it a drop-in llama.cpp component. Compare against [current llama.cpp draftless speculation](https://github.com/ggml-org/llama.cpp/blob/master/docs/speculative.md).

**Our experiment.** Index the function being edited and a small set of relevant snippets. Propose continuations from unchanged syntax subtrees, repository idioms, and deterministic transformations. Resume matching after changed regions. These are candidate tokens: hidden states from a different context cannot be copied along with the source text.

Start with one language, function edits, greedy generation, and a linear proposal sequence. Compare ordinary decoding, upstream n-grams, source-directed drafts, and generating only the changed span. The last control matters: avoiding a full rewrite may save more than accelerating its unchanged text. Add branching only when measured accepted lengths justify tree-verification complexity.

**Implementation and budget.** Add a tokenizer-aware source index, a draft-provider interface, adaptive proposal length, and timing for retrieval, verification, rejection, and state restoration. Begin with an index budget of tens of MiB. AST byte boundaries must be retokenized correctly, including whitespace and tokens spanning a boundary. Invalidate candidates when their source changes.

If a round emits an average of A usable tokens, including any target continuation, the useful condition is:

T_retrieve + T_verify(K) + T_restore < A × T_ordinary_token.

A high match rate alone does not establish this inequality. Large verification batches can be slow on a CPU; branching can inflate scratch memory.

**Promotion and failure.** Require greedy output equivalence on the pinned implementation and faster complete edits, including difficult edits with little source overlap. Inspect tail latency. A stochastic extension needs the correct target-distribution acceptance procedure; accepting merely similar tokens changes the model. Disable speculation when recent acceptance and timing predict a loss.

**Cost and next step.** Several days is a plausible narrow linear prototype estimate after instrumentation exists. Tree attention is a separate, potentially weeks-long integration. This is one of the first experiments because its core hypothesis can be tested without training or an additional resident model.

## 3. Compile repeated workflows into incremental programs

**Hypothesis and evidence.** Repeated coding operations should eventually need fewer planning turns. [Agentic Plan Caching](https://arxiv.org/abs/2506.14852) supports investigating reusable planning structure. [Bazel Skyframe](https://bazel.build/reference/skyframe) provides the relevant systems principle: explicit dependencies, immutable computed values, and incremental reevaluation. Neither demonstrates the quality of our proposed coding workflow compiler.

**Our experiment.** Turn a few successful workflows into typed programs with parameters, applicability guards, declared reads, effects, and failure exits:

resolve target → obtain references → inspect contracts → unresolved model decision → apply bounded edit → verify.

Stable work runs directly. The model handles unresolved decisions. This differs from retrieving a prose plan because the host understands dependencies and can identify exactly which operations must run again.

Prototype three workflows: symbol rename, bounded configuration change, and changing a function plus callers. Compare the ordinary agent, prose-template reuse, and compiled execution. Perturb file contents, dependency versions, paths, tool versions, configuration, and interruption points. Include superficially similar tasks for which a template should decline.

**Implementation and budget.** Build a small workflow representation, dependency fingerprints, a result cache, and effect tracking. Reuse pure reads only when their dependencies remain valid. External data needs freshness rules. Applying edits or running other mutations cannot be treated as retrieving a cached value. A completed test result is reusable only for the exact relevant artifact and environment.

The latency model is T_guards + T_invalidated_work + T_unresolved_decisions. It wins when removed planning and tool work exceed guarding and bookkeeping. Cap stored traces and retire low-value templates. Record cache-hit benefit, validation cost, and stale-result incidents separately.

**Promotion and failure.** Require correct outcomes under perturbation, fewer model calls, and lower accepted-task latency. A hidden filesystem read can invalidate the dependency model; instrument reads or conservatively widen the dependency set. If determining applicability costs as much as ordinary planning, that template has no speed case. On guard failure, return to the normal agent with useful observations retained.

**Cost and next step.** Allow weeks for three reliable workflows, rather than claiming a general compiler after a demonstration. Start alongside inference experiments because eliminating model turns can exceed kernel-level gains. The same mechanism can later support repeated document and data tasks, using their own contracts and invalidation rules.

## 4. Model-guided bounded program synthesis

**Hypothesis and evidence.** A small model can suggest a promising search space while a local solver finds a correct expression. [HySynth](https://arxiv.org/abs/2405.15880) and its [public code](https://github.com/shraddhabarke/hysynth) provide a concrete model-guided synthesis approach. [Narcissus](https://arxiv.org/abs/2608.25657) is a recent preprint investigating context-aware proposal guidance; it is not established evidence for general repository repair. [cvc5's SyGuS API](https://cvc5.github.io/docs/cvc5-1.3.1/examples/sygus-fun.html) supplies a usable CPU synthesis interface.

**Our experiment.** Restrict the first prototype to small pure expressions: indexing boundaries, retry limits, predicates, numeric conversions, and data transformations. Obtain variables and types from source analysis. Ask the model once for a structure or likely operators, then synthesize within a bounded grammar. Keep all allowed productions reachable so incorrect model guidance cannot exclude the correct result forever.

Use roughly 30 initial expression-repair tasks to expose feasibility failures, followed by a larger held-out evaluation before a product claim. Compare direct generation, repeated generate-test-repair under the same wall-clock budget, unguided synthesis, and guided synthesis. Include intentionally wrong or incomplete model proposals.

**Implementation and budget.** Required components are a source-to-solver translation, typed grammar, counterexample loop, patch application, and timeout handling. Overflow, nullability, units, short-circuit evaluation, and evaluation order must match the source language. Use bit-vectors where bounded machine integers require them. Start with a small AST-depth bound and a proposed sub-second to low-seconds search allowance. Search may grow exponentially.

**Promotion and failure.** Accept only improved held-out correctness or reduced time to a verified result under equal resources. A solver proves its encoded specification, not the user's entire intention. Finite examples may admit incorrect generalizations; trusted contracts and additional counterexamples matter. Report timeouts and unsolved tasks honestly. If semantic translation is more expensive or fragile than the repair, narrow the supported domain.

**Fallback and cost.** Return to ordinary editing with counterexamples gathered during search. A narrow expression language is a medium-sized prototype; general function synthesis is a much larger research project. This deserves early experimentation because it can turn one weak model suggestion into a stronger checked result, without pretending the model itself became universally more capable.

## 5. SmallThinker: sparse inference and an explicit parameter working set

**Hypothesis and evidence.** A model whose architecture reveals future expert needs can reduce active computation and overlap selected weight reads with useful work. [SmallThinker-4B-A0.6B](https://huggingface.co/Tiiny/SmallThinker-4BA0.6B-Instruct) has an Apache-2.0 model release and a [public PowerInfer runtime](https://github.com/Tiiny-AI/PowerInfer/tree/main/smallthinker). The [paper](https://arxiv.org/html/2507.20984v1) describes pre-attention routing, sparse experts, sparse FFNs, and prefetching during attention. This is more actionable than a proposal with no model or runtime.

**Our experiment.** Run the 4B model fully resident first. Sparse compute may help on an 8–16 GB laptop even when SSD offloading does not. Then impose measured working-set limits and sweep them. Separate four configurations: sparse FFNs with a full LM head; expert caching without prefetch; caching with prefetch; and optional approximate LM-head prediction. Disable the approximate predictor initially.

The runtime documents x86 and Android builds, Q4_0 conversion, expert bundles, cache controls, and a maximum of eight threads. Linux-oriented I/O dependencies make Windows/macOS portability additional work. Its model card lists a 2.24 GiB fully resident configuration; that is not a substitute for measuring the entire process plus context and buffers.

**Budgets and controls.** Compare against a fully resident smaller model and ordinary mapped loading with the same actual system/process memory limit. Count filesystem page cache and I/O buffers; otherwise allegedly offloaded weights may remain resident elsewhere. Include cold storage reads, repeated prompts, new topics with different expert demand, battery mode, and sustained operation.

At target rate R, an optimistic necessary condition is missed weight bytes/token < effective SSD bandwidth/R. Illustratively, 1 GB/s and 20 tokens/s allow at most 50 MB/token before other costs; random reads and imperfect overlap tighten this considerably. This is a bound, not a predicted operating point.

**Evidence and failure.** The project's own table reports a Pi 5 falling from 28.77 to 0.75 tokens/s in its 1 GiB configuration. Desktop results cannot be transferred to a baseline laptop. Promote the configuration only if it improves the quality–latency–memory tradeoff over the best resident alternative. When I/O dominates, retire that offloading setting while retaining the resident sparse-inference branch.

**Cost and next step.** Reproduction on supported Linux hardware is an early medium-effort branch; porting the I/O engine is larger. Explicitly compare its coding quality before investing in backend integration. An attractive active-parameter count does not establish useful coding ability or total memory demand.

## 6. Precision as an execution resource

**Hypothesis and evidence.** Precision could become a calibrated execution choice instead of a permanent download-time choice. Two different research paths must remain separate. [T-MAC](https://github.com/microsoft/T-MAC) provides CPU lookup-table kernels for supported low-bit integer representations. [Any-Precision LLM](https://github.com/SNU-ARC/any-precision-llm) stores nested bitplanes with precision-specific centroid tables and provides a CUDA implementation. [DP-LLM](https://github.com/SNU-ARC/DP-LLM) investigates dynamic layer-wise precision; its README currently says latency-measurement code is forthcoming.

**Compatibility boundary.** Any-Precision's nonuniform centroids are not automatically compatible with T-MAC's integer arithmetic. Its reference path reconstructs indices, looks up centroids, and performs multiply-accumulates. Combining these papers' names does not remove dequantization. Truncating arbitrary GGUF quantizations is also not a valid nested-precision implementation.

**Two smallest prototypes.** Track A reproduces one already supported T-MAC model/operator and compares against current CPU kernels, including conversion/quantization equivalence and matched threads. Historical llama.cpp comparisons are insufficient. Track B ports one Any-Precision matrix-vector operation to AVX2 or NEON and compares 3-/4-bit execution with separately packed equivalent quantizations. Validate numerical reconstruction before benchmarking. A positive operator result earns a model-level experiment; it does not yet prove one.

Start precision selection at independent task boundaries. Per-layer policies and live precision changes come later. Measure policy overhead, actual bytes moved, unpacking, centroid tables, scratch allocations, and quality. A 4→3-bit change removes at most 25% of the affected weight payload. For two billion affected weights, the idealized difference is 250 MB; runtime savings are smaller or different once other allocations are included.

**State correctness.** A high-precision model cannot treat KV or recurrent state generated along a low-precision trajectory as its exact state. Exact low-precision drafting/high-precision verification requires correct target state, replay or recomputation where needed, and a valid acceptance algorithm. Separate states can erase the memory advantage. Approximate adaptive precision is a legitimate experiment, but must be labeled and evaluated as such.

**Promotion, failure, cost.** Require a better complete-task quality/latency/energy tradeoff, not fewer nominal bits. Stop when unpacking or unsupported instructions erase bandwidth savings. Fixed GGUF quantization remains the fallback. T-MAC reproduction is a medium-effort branch; a portable nested-precision engine is several weeks or more of kernel research, justified only by the operator results.

## 7. Specialize hardware by phase

**Hypothesis and evidence.** Prefill, decode, retrieval, and verification have different arithmetic intensity. [PowerInfer-2](https://arxiv.org/html/2406.06282v2) uses phase-specific execution on rooted Qualcomm phones with specialized models. [PowerServe](https://github.com/powerserve-project/PowerServe) exposes GGML/QNN integration but requires converted NPU artifacts. [FusionML](https://arxiv.org/abs/2607.22785), with a [public repository](https://github.com/ommo007/FusionML), investigates CPU+GPU prefill on Apple unified memory. Its July 2026 preprint is author evidence pending reproduction; a useful implementation issue is lazy scheduling that serializes nominally concurrent work.

**Our experiment.** On one actual machine, measure CPU-only and accelerator-only prefill and decode over prompt lengths. Attempt one boundary: accelerator prefill followed by CPU decode, or genuinely concurrent CPU+GPU prefill followed by an existing decode path. Use the same model, precision, prompt, and output budget. Trace execution and synchronization; utilization percentages do not prove overlap.

**Implementation and budget.** The experiment requires compatible graph semantics, KV/recurrent-state layout, synchronization, and bounded scratch allocations. A device API that cannot export usable state needs a conversion adapter or a different experiment. Reprocessing the prompt on the second device must be charged; hiding it invalidates the claimed gain. Include duplicated weights, staging buffers, both state copies during handoff, and temporary conversion memory.

The basic condition is T_fast_prefill + T_state_handoff < T_baseline_prefill. Handoff includes synchronization, layout conversion, and actual copying. A short prompt may never amortize it. CPU and integrated GPU compete for memory bandwidth and thermal headroom; adding their separately measured decode rates is not a performance model.

**Promotion and failure.** Calibrate the prompt-length and device regimes where whole-request gains repeat without changed task quality. Include sustained battery and plugged-in runs. Reject configurations with hidden serialization, excessive state duplication, or weaker precision masquerading as scheduling improvement. Cache calibration decisions; continually probing both devices can disturb the workload and evict useful state.

**Cost and next step.** Reproduce an existing implementation where the hardware matches before writing a new transfer layer. This is medium effort with matching artifacts and high effort for a new GGUF/backend combination. Retain a single-backend path. An NPU is eligible only after operator, model, precision, context, and state support are verified; its presence on a spec sheet is insufficient.

## 8. FunctionGemma: a tiny semantic action controller

**Hypothesis and evidence.** Frequent semantic actions might be selected by a much smaller model than the general coding brain. [FunctionGemma's model card](https://ai.google.dev/gemma/docs/functiongemma/model_card) describes a 270M function-calling model; [fine-tuning guidance](https://ai.google.dev/gemma/docs/functiongemma/finetuning-with-functiongemma) emphasizes adaptation. An [official ggml-org GGUF repository](https://huggingface.co/ggml-org/functiongemma-270m-it-GGUF/tree/main) contains a roughly 292 MB Q8_0 artifact and a roughly 543 MB BF16 artifact. File size is not peak runtime memory. It uses the Gemma license, not Apache-2.0.

**Our experiment.** Choose 8–12 real operations such as FindSymbol, RenameSymbol, InspectCallers, and RunRelevantChecks. The controller receives bounded observations and selects an operation or abstains. The host resolves targets, checks document versions, validates arguments, and executes effects. Do not delegate unrestricted shell execution to a tiny action classifier.

Prepare a few thousand verified task trajectories, including paraphrases, missing arguments, ambiguity, stale references, unsupported tasks, and explicit requests to abstain. Fine-tuning can be prepared once on suitable hardware; it is not assumed to run continually on an 8 GB laptop. Split by task templates and repositories to prevent memorizing phrasing.

**Controls and budget.** Compare a deterministic command palette, the general model with the same tools, the untuned tiny model, the tuned tiny model, and tuned routing with fallback. Begin with Q8 to avoid confounding capability with aggressive quantization. Measure whether co-residency with the main model is actually affordable; one resident generator as a baseline does not prohibit a useful small auxiliary model. A proposed 1 GB reservation is a test allowance, not a measured footprint.

Count controller inference, extra context construction, failed classifications, general-model escalation, and any model swaps. Do not claim a saving for requests already handled cheaply by explicit deterministic commands.

**Promotion and failure.** Require lower accepted-operation latency and adequate held-out correctness with fallback costs included. Plausible but wrong actions are a more serious failure than abstentions. Excessive abstention or frequent escalation can erase the benefit. Keep the operation vocabulary narrow until its confusion matrix and failure cases are understood.

**Cost and next step.** Several days for a narrow prototype after tool contracts and evaluations exist is a planning estimate; collecting trustworthy training data may take longer. This is an early branch because a public small model and GGUF already exist. It is a controller candidate, not evidence that 270M parameters replace a general coding model.

## 9. Mistake-only nearest-neighbor code memory

**Hypothesis and evidence.** A compact coder might recover repository-specific APIs and identifiers from a small learned-state memory instead of carrying more dense parameters or reading longer prompts. The [ASE 2023 kNM-LM project](https://github.com/zetang94/ASE2023_kNM-LM) stores hidden states associated with mistaken predictions and the correct next token. [Efficient kNN-LM](https://github.com/jxhe/efficient-knnlm) and [kNN-transformers](https://github.com/neulab/knn-transformers) provide related implementation references. Their older CodeGPT/UniXcoder-era results do not establish gains on current small coders.

**Our experiment.** Use a useful 0.5–1.5B coder and cap the first bank at 100,000 entries from earlier repository versions. Evaluate on later code, excluding near-duplicate leakage. Focus initially on APIs, names, and repetitive local conventions. Retrieve nearby hidden states and mix their token evidence into the model's prediction with a calibrated gate.

Start with full-dimensional keys to establish the signal, then test projection or quantization while measuring neighbor recall and task effects. A bank built from one representation is not automatically valid after changing the model, adapter, or deployed quantization.

**Implementation and budget.** This requires hidden-state extraction and intervention in logits or sampling. A normal chat-completion endpoint is insufficient. At 100,000 entries, 256-dimensional FP16 keys occupy 51.2 MB; 1,024 dimensions occupy 204.8 MB. Labels, provenance, the ANN index, and allocator overhead are additional. A proposed 128–256 MB bank cap makes the memory tradeoff explicit; base weights, KV, and scratch still count.

Compare no memory, short BM25-retrieved context, all-token kNN memory, mistake-only memory, and inexpensive LSP-derived candidates. Measure lookup frequency and selective activation. Running approximate-neighbor search at every generated token may increase latency even if perplexity improves.

**Promotion and failure.** The intended gain can be fewer repairs or the ability to use a smaller base model, not necessarily faster raw decoding of the same model. Require temporal held-out improvements on accepted code tasks with retrieval costs included. Stale APIs, misleading nearest neighbors, and overconfident interpolation need abstention or a small gate. If LSP candidates give the same benefit more cheaply, prefer that mechanism for those cases.

**Cost and next step.** A reference prototype may take about a week; native integration is a separate decision. This is a plausible route to adding local knowledge without a permanently larger dense brain, but repository retrieval remains the simpler baseline it must beat.

## 10. Compile stable knowledge into removable adapters

**Hypothesis and evidence.** Repeatedly used documentation might be transformed into a small adapter once, reducing repeated prompt processing. [Doc-to-LoRA](https://github.com/SakanaAI/doc-to-lora), its [paper](https://arxiv.org/html/2602.15902v1), and [Text-to-LoRA](https://github.com/SakanaAI/text-to-lora) provide trained hypernetwork approaches. Existing reference artifacts are tied to particular base models; their H200 measurements are not laptop measurements. [llama.cpp's LoRA converter](https://github.com/ggml-org/llama.cpp/blob/master/convert_lora_to_gguf.py) is a possible export path for supported standard matrices, not a guarantee that arbitrary generated adapter structures convert.

**Our experiment.** Select a stable API manual or narrow knowledge domain reused across many tasks. Reproduce the existing compatible base/hypernetwork first. Prepare an adapter in an explicit maintenance step, validate its matrix structure and numerical behavior, then test GGUF export where supported. Do not start by training a new hypernetwork.

Bind adapter identity to the exact base model, source hash, scope, and evaluation. Load only a relevant adapter and reset or unload it after its scope ends. An API setting that disables an adapter may leave its weights resident; true lifecycle accounting matters.

**Budgets and controls.** Adapter storage is approximately bytes_per_parameter × sum over adapted matrices of rank × (input_dimension + output_dimension). Illustratively, rank 16 on four 2,048-by-2,048 projections across 24 layers in FP16 is about 12.6 MB. Feed-forward projections and other dimensions change that figure. Combining document chunks by concatenating ranks increases memory and compute; adapter size is not magically constant as documents accumulate.

Compare short retrieved passages, full context, already-warm prefix-cached context, ordinary supervised LoRA, and hypernetwork-generated adapters. If preparation takes P and each query saves S, amortization requires more than P/S uses when S is positive. Include adapter loading, switching, and invalidated model state in S.

**Promotion and failure.** Test questions and code tasks that demand the supplied knowledge, including conflicting and out-of-scope facts. Adapter memory is lossy and unsuitable as the sole mechanism for exact quotes or rapidly changing source. Changing an adapter invalidates incompatible cached KV/recurrent state. Interference between documents, unnoticed rank growth, or little advantage over a warm prompt can defeat the proposal.

**Cost and next step.** A compatible reference feasibility test may take days; a reliable port or new-base hypernetwork can take weeks or longer. Keep this branch behind the small-controller and source-draft tests, while giving it a concrete reuse-heavy workload rather than dismissing it as permanently impractical.

## 11. Shared weights and adaptive recursion

**Hypothesis and evidence.** Reusing a learned block could reduce unique parameter storage while allocating different amounts of computation to different tokens. [Mixture-of-Recursions](https://github.com/raymin0223/mixture_of_recursions) releases reference code and nominal 360M Vanilla, Recursive, and MoR checkpoints. Its [paper](https://arxiv.org/html/2507.10524v1) studies learned token-dependent depth and recursion-specific state. This requires trained architectural support; deleting layers from an ordinary coder does not produce the same model.

**Critical evidence limit.** The paper's throughput comparison in Appendix D uses H100 batching, including batch 32 and adaptive settings around 42–51, and excludes KV-cache update time. Those choices prevent treating its headline improvement as a batch-one consumer-CPU result.

**Our experiment.** Run the three released variants on CPU at batch one, charging all routing and cache operations. Start with compact code continuations and structured tasks their capability can support. Compare fixed recursion with learned adaptive depth. Also compare against a conventional small coder matched by total memory and, separately, by latency.

**Implementation and budget.** Inventory unique physical tensors rather than assuming a nominal model label equals stored weights. Count embeddings, routers, every recursion's state, and scratch memory. A shared block can still be reread from DRAM repeatedly when it exceeds last-level cache, so parameter sharing does not automatically reduce bytes moved per generated token in proportion to storage.

The runtime must implement the routing graph and cache semantics. GGUF could store tensors and metadata, but the format alone does not execute recursion. A Python reference graph is adequate for proving functionality and finding obvious failure modes, not for declaring optimized runtime limits.

**Promotion and failure.** Require a useful quality–latency–memory frontier at batch one, with no omitted state update costs. Learned early exit changes computation and is an approximate quality tradeoff unless a full target verification mechanism is added and charged. Retire the laptop-speed claim if gains depend on large server batches, if routing overhead dominates, or if coding quality is insufficient.

**Cost and next step.** Allow days for the reference feasibility comparison. Native integration and better coder training are larger projects conditional on a positive result. The worthwhile question is whether shared weights buy useful capability per resident byte on this workload—not whether recurrence sounds computationally elegant.

## 12. Diffusion for bounded code patches

**Hypothesis and evidence.** Updating blocks of tokens in parallel could reduce serial generation time on hardware that handles matrix operations better than one-token decode. [Open-dLLM](https://github.com/pengzhangzhi/Open-dLLM), [Open-dCoder-0.5B](https://huggingface.co/fredzzp/open-dcoder-0.5B/tree/main), and [DreamOn](https://github.com/DreamLM/DreamOn) provide concrete starting points. The small code checkpoint is about 1.26 GB as distributed, and the reference has a CPU path. These facts establish accessibility, not speed.

**Critical evidence limit.** A demonstration with 200 denoising rounds for 128 tokens is not a speed result. Infill quality measured with oracle knowledge of the correct output length can be substantially better than realistic length selection. The practical system must choose or expand its own output length and pay for wrong choices.

**Our experiment.** Restrict the task to a bounded function body or local patch. Sweep output block length and denoising rounds; include a realistic initial length estimate, expansion policy, and stopping rule. Compare against the originating Qwen2.5-Coder-0.5B fill-in-the-middle path on the same source, edits, information, and hardware. Within the diffusion model, compare schedules to isolate inference policy from changed training.

**Implementation and budget.** A separate generation backend needs bidirectional/block masks, iterative updates, and valid cache semantics. Ordinary autoregressive KV reuse cannot simply be assumed. Charge full-sequence recomputation, rejected candidates, resizing, compilation, and repair.

Besides weights and activations, block logits can matter: 128 positions × 152,000 vocabulary entries × two bytes is about 39 MB for one logits tensor. Keeping every denoising trajectory multiplies memory needlessly. Measure actual dtype and tensors; a quantized-weight file does not imply all intermediate tensors use the same precision.

**Promotion and failure.** Plot accepted-patch latency against quality for each round count and length policy. Require an improvement at useful correctness, not more tokens updated in parallel. Stop the laptop speed branch if acceptable quality needs too many serial rounds or repeated full recomputation. A specialized infill win is valuable even if interactive conversational streaming remains better served by autoregression.

**Cost and next step.** A reference speed/quality curve is a days-scale experiment. An optimized block backend is a weeks-scale investment only after that curve reveals a credible opportunity. This is a concrete unconventional branch, with an existing small model rather than a proposal to pretrain a new diffusion system from scratch.

## 13. Engram-style sparse knowledge modules

**Hypothesis and evidence.** A small dense model might gain useful knowledge from a sparse learned lookup table without increasing every dense layer. [Engram](https://github.com/deepseek-ai/Engram) and its [paper](https://arxiv.org/html/2601.07372v1) motivate conditional memory. The public demonstration uses mocked attention/MoE components; it is not a ready-to-run small coder checkpoint. Large-model host-memory experiments do not establish a consumer SSD implementation.

**Our experiment, not a reported result.** Freeze a useful 0.5–1.5B coder and add a small trained lookup/gating module at one or two selected layers. Train only that module on a bounded, permitted API/code domain. Begin with 65,536 rows, then test 262,144 only if the smaller bank helps. Preserve case and code-sensitive distinctions; text normalization that conflates identifiers can destroy the desired signal.

Initialize the residual contribution conservatively and verify that the untouched baseline is reproducible. Compare an equal-byte LoRA, retrieval in the prompt, a slightly larger dense model, and shuffled or random lookup banks. The last controls test whether learned memory rather than extra compute or training explains the gain.

**Implementation and budget.** This needs learned residual computation, hashes or n-gram addressing, gates, and model metadata inside the runtime. A Python request router cannot emulate an internal layer while leaving model execution unchanged.

At 262,144 rows and 256 INT8 values per row, one aggregate table uses about 67.1 MB before scales, metadata, projections, and allocator costs; FP16 doubles the raw table size. Be explicit about whether this is the total bank or a bank replicated per head/layer. Start in RAM. Consider SSD only after access traces show a predictable hot set and the RAM version has a quality case.

**Promotion and failure.** Evaluate unseen API usage and temporal/repository holdouts. Gains that disappear outside memorized examples do not justify a general capability claim. Inspect whether the gate ignores the module, overuses stale entries, or introduces errors into unrelated tasks. Retire configurations whose lookup overhead exceeds avoided reasoning or repair cost.

**Cost and next step.** A focused prototype may take a week or more; useful training, porting, and broad evaluation take longer. This is a research investment after easier external-memory tests, with a strict small-bank constraint. It is worth trying because it explores additional capability per resident byte, while preserving enough controls to identify a negative result.

## 14. Four bounded probes beyond the main twelve

These ideas receive a small falsification probe rather than an immediate product integration. They are not permanently excluded.

| Probe | What to try first | Why the scope is bounded |
| --- | --- | --- |
| [Byte Latent Transformer](https://github.com/facebookresearch/blt) | Inventory tensors and access patterns, then test feasible quantization/lookup memory before a full inference port. Compare bytes of useful output per second, not tokenizer-dependent token counts. | The [BLT-1B artifact](https://huggingface.co/facebook/blt-1b/tree/main) is about 9.07 GB, with a separate roughly 199 MB [entropy model](https://huggingface.co/facebook/blt-entropy/tree/main). Its label does not describe the whole deployment footprint. The release includes a noncommercial license constraint. |
| [Coconut](https://github.com/facebookresearch/coconut) latent reasoning | A small executable dependency-planning benchmark; compare no reasoning, text reasoning, and latent steps at equal wall time and forward-pass budget. | Latent steps still require model computation. Removing visible reasoning tokens does not make those steps free or establish general coding ability. |
| [Tiny Recursive Models](https://github.com/SamsungSAILMontreal/TinyRecursiveModels) | Transfer a bounded solver or verifier to a narrow task with exact outcomes. Use the [public verification artifacts](https://huggingface.co/arcprize/trm_arc_prize_verification) to understand the original evaluation. | A small puzzle model is not a general-purpose coding brain. A useful specialized solver would still be a meaningful component. |
| [SEAL](https://github.com/Continual-Intelligence/SEAL) | Offline candidate adaptation with held-out executable checks; compare ordinary verified supervised adaptation and compiled procedures. | Original adaptation experiments require resources beyond baseline laptop inference. Continual self-training can cost more than the behavior it improves and can degrade unrelated tasks. |

For each probe, record the earliest decisive obstacle: model availability, license suitability, unique tensor memory, operator support, batch-one cost, or lack of useful task quality. A negative result should name a tested constraint. “Experimental” alone is not a reason to reject a mechanism.

## 15. Parallel roadmap and promotion rules

The first implementation work is a shared measurement and compatibility harness, not a full application. Pin model and runtime revisions; preserve a source snapshot; record rendered prompt identity, model state identity, backend settings, elapsed phases, accepted output, and peak total memory. Establish representative 8 GB and 16 GB profiles, then run on actual available hardware before assigning speed claims.

| Stage | Reliable execution track | Experimental track | Evidence required to proceed |
| --- | --- | --- | --- |
| A: Make comparisons possible | Minimal GGUF execution, direct semantic tools, source-version checks, cancellation, and trusted task evaluation | Artifact inspection and operator/reference smoke tests for the first branches | Same task can be replayed; memory and failure costs are visible; unsupported features fail clearly |
| B: Test the cheapest major departures | Bounded context, compact edits, warm-state identity, and controlled inference admission | Source-directed drafts; fully resident SmallThinker with approximate LM head disabled; tiny FunctionGemma controller | Complete-task gain or a better quality–memory frontier, with mechanism-specific controls |
| C: Remove repeated reasoning and strengthen small models | Incremental indexing, dependency-aware reusable results, robust workflow execution | Three compiled workflows; bounded synthesis; mistake-only code memory | Perturbation tests catch stale dependencies; held-out tasks improve after lookup/search/guard costs |
| D: Test representation and scheduling | Stable capability adapters and reproducible backend profiles | Diffusion patches; reusable documentation adapters; CPU/accelerator phase specialization; controlled SmallThinker offloading | Positive reference curves, memory accounting, and state conversion correctness before native ports |
| E: Invest where earlier evidence points | Integrate only promoted mechanisms and maintain fallbacks | T-MAC reproduction, nested-precision CPU kernels, adaptive recursion, small Engram-style modules | Operator-level evidence plus useful batch-one task quality; explicit justification for training/runtime investment |

Stages are dependency gates, not a demand to finish every item before any later probe. Cheap reference tests can overlap earlier stages. Allocate separate experimental capacity after the harness exists; do not let baseline polish postpone all unconventional work. Conversely, do not run every branch simultaneously on one memory-limited laptop and confuse contention with a mechanism's inherent performance.

Use a standard result record: hypothesis; exact artifact and revision; changed variable; baseline; workload and held-out split; correctness contract; memory breakdown; cold/warm/sustained timings; accepted-task quality; failures; fallback rate and cost; confidence/variance; and next decision. Save the smallest reproducer for every surprising positive or negative result.

Promotion has three levels. A reference result earns an optimized prototype. An optimized result earns broader hardware/task evaluation. Only that evaluation earns a default product setting. Keep optional mechanisms available where they help a specific regime. For example, a long-prompt prefill handoff need not help short requests, and resident sparse inference can remain useful after SSD offloading fails.

Training-heavy branches first reuse public checkpoints and small adaptation sets. Off-device preparation is a possible later resource choice, not an assumption of unlimited GPUs or a new spending authorization. The delivered laptop inference system should remain useful without continuous remote service.

The first three concrete prototypes are therefore source-directed linear drafts, resident SmallThinker, and a narrow tiny-controller task set. Workflow compilation and bounded synthesis follow the same host-tool foundation in parallel. This gives the project several plausible ways to make large gains while each experiment remains cheap enough to disprove.

## 16. Handoff and evidence boundaries

This dossier is intentionally broader than the initial baseline. It covers twelve mechanisms with implementable first tests, plus four narrower probes. The [master report](architecture.md) connects them to the hardware, model, decoding, context, and coding-execution dossiers.

No result here demonstrates a particular speed on the user's machine. Exact CPU/GPU/NPU, RAM configuration, memory bandwidth, OS, power policy, and storage remain unknown. The execution environment did not provide a usable shell or the user's PC filesystem during this research, so artifact inspection and source research must not be confused with installed software or reproduced benchmarks.

The strongest architectural hypothesis is cumulative but not multiplicative: remove predictable work through direct tools and compiled workflows; improve small-model usefulness through bounded evidence and specialized mechanisms; accelerate remaining generation where verification and hardware measurements justify it. Each layer must repay its own memory, complexity, and failure-recovery costs.

The research stage is complete enough to begin the specified measurement harness and first prototypes. Their purpose is to decide which unconventional mechanisms deserve the larger build, with actual consumer-hardware evidence.
