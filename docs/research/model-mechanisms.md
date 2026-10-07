# Model mechanisms: architecture, quantization, compatibility and routing

> Research snapshot: 7 October 2026. [Original Page](https://chatgpt.com/space/page_72935eaedbf081918e3ff5743e7de1c4). This document records evidence, hypotheses, and proposed experiments. Implemented scope is described in the [repository README](../../README.md); proposals are not measured product capabilities. The [evaluation contract](evaluation-contract.md) governs qualification where older research language differs.

Research date: 7 October 2026. Scope: pluggable local brains for ordinary 8–16 GB laptops, coding first and general assistance second. This dossier separates model architecture from inference kernels and from the surrounding agent. All recommendations are provisional until the target laptop and tasks are measured.

**Evidence labels:** Established = a published mechanism or inspected implementation; Conditional = usable only with specified model/runtime/hardware; Proposal = our design or experiment, without measured local results. A vendor benchmark establishes a result in that vendor's setup, not our laptop performance. “Open weights,” a GGUF download, and a permissive redistribution license are separate properties.

This is a companion to the [architecture overview](architecture.md). Its decisions replace blanket assumptions that smaller files always decode faster, that sparse active parameters determine RAM, or that successful loading proves compatibility.

## M01. Optimize useful capability per complete-task cost

The model should minimize expected cost at an acceptable success rate, not maximize tokens per second. Define cost as latency, energy, peak committed memory and user correction effort. Keep those dimensions visible rather than hiding them inside an arbitrary “intelligence density” score.

An illustrative independent-retry model gives expected attempt time divided by success probability, T/p. It explains why a 10-second attempt with 25% success can be worse than a 20-second attempt with 80% success. Real repairs are correlated and do not restart identically, so evaluate complete task traces instead of treating this ratio as a prediction.

**Experiment:** compare candidates on the same held-out tasks, tools, context and output budget. Record first-attempt success, eventual success, rejected patches, repair time, and timeouts. Report failures separately; do not improve apparent latency by excluding failed tasks. A candidate enters the default set only after its quality and latency tradeoff is visible for each workload class.

**Decision:** maintain a small measured frontier: fastest acceptable small model, strongest model that comfortably fits, and at most one unusual architecture under evaluation. Avoid maintaining a large catalog of untested combinations.

## M02. Dense versus sparse mixture-of-experts models

Dense models use most layer weights during each token step. MoE models route a token to selected experts, reducing active arithmetic relative to total parameters. The unused experts still occupy storage, and frequently must remain in memory to avoid expensive loading. Routing, scattered expert access and low batch sizes can reduce hardware efficiency.

A hypothetical 30B-total/3B-active model at an effective 4.5 bits per weight needs about 16.9 GB for weights alone. Its 3B active count does not make it equivalent to a 3B resident model. A tiny expert cache may repeatedly fault different experts as the topic changes. This arithmetic is illustrative, not a measurement of a named model.

**Requirements:** the complete working set must fit, or an explicitly profiled offloading system must make expert transfers affordable. Verify shared experts, routing behavior, active tensors and scratch allocations from the actual model configuration.

**Experiment:** compare a fitting dense model against a fitting MoE at matched task quality; measure expert-cache misses, page faults, load latency and tail latency during topic changes. Reject the MoE if average throughput hides recurrent stalls.

**Decision:** no large offloaded MoE in the baseline. Small fitting MoEs remain eligible. The [DeepSeek-V2 report](https://arxiv.org/abs/2405.04434) illustrates the distinction between total and active parameters and introduces a separate attention-compression mechanism; its server-scale gains are not laptop predictions.

## M03. Attention architecture is a memory choice

For conventional equal-sized K and V heads, an unpadded KV estimate is:

M_KV = 2 × attention_layers × live_tokens × KV_heads × head_dimension × bytes_per_element × live_sequences.

Grouped-query attention reduces KV heads relative to query heads; multi-query attention shares a single KV head. These are trained architectural properties, not runtime switches that can safely be applied to arbitrary weights. MLA stores a compressed latent representation, but realized savings depend on the runtime's representation and kernels. Inspect allocation logs instead of assuming the paper's representation is what a backend stores.

**Experiment:** profile identical prompt lengths at 512, 2K, 4K and 8K tokens; separate prefill, per-token decode and peak memory. Long contexts increase both retained memory and attention work even when weights stay constant. Choose the shortest context that preserves task success.

**Decision:** include attention type, KV head count, dimensions, cache precision and tested context in every profile. [GQA paper](https://arxiv.org/abs/2305.13245).

## M04. Hybrid recurrent models: cheaper growing context, different state semantics

Gated DeltaNet, Mamba-family and convolutional hybrids maintain recurrent summaries for some layers instead of retaining full per-token K/V there. A hybrid can therefore reduce the slope of memory growth with context length. Its full-attention layers still grow with context; recurrent matrices, convolution history and rollback checkpoints still consume memory.

The delta-rule mechanism updates a structured state rather than appending all historical keys and values. This changes how an engine can rewind after rejected speculative tokens or reuse a modified prompt. Current llama.cpp support must be checked at the exact build and backend; “hybrids cannot cache” and “hybrids rewind like ordinary attention” are both inadequate descriptions. [Gated Delta Networks](https://arxiv.org/abs/2412.06464).

**Worked architectural estimates, excluding padding, scratch, copies and checkpoints:**

| Model/configuration | F16 attention KV at 4,096 tokens | At 8,192 tokens | Additional state |
| --- | ---: | ---: | --- |
| Qwen2.5 Coder 1.5B: 28 layers, 2 KV heads, head size 128 | 112 MiB | 224 MiB | Ordinary attention cache assumptions |
| Qwen3.5 4B: 8 full-attention layers, 4 KV heads, head size 256 | 128 MiB | 256 MiB | 24 recurrent layers plus convolution state and checkpoints |

For Qwen3.5 4B, a straightforward recurrent-matrix estimate is 24 × 32 value heads × 128 × 128 × 4 bytes = 48 MiB for one matrix state per layer. This is a model-level estimate; runtime layouts, state precision, sequence slots and rollback snapshots determine actual allocation. The arithmetic is calculated from the [official 4B configuration](https://huggingface.co/Qwen/Qwen3.5-4B/raw/main/config.json) and [coder configuration](https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct/raw/main/config.json).

**Experiment:** append identical continuations to cached and freshly processed prefixes; then edit a token near the beginning, middle and end. Check results, tokens reprocessed, memory and restore latency. Repeat with the intended speculation mode. Reject any optimization that silently resumes the wrong recurrent state.

**Decision:** hybrid models are serious candidates, but state operations are negotiated capabilities. A checkpoint budget is part of the model profile.

## M05. Post-training weight quantization

Quantization reduces weight bytes and can reduce bandwidth demand. It also introduces packing, scale loading, conversion or specialized arithmetic. Effective bits per weight include scales, metadata and tensors kept at higher precision. A label such as Q4 does not imply every parameter occupies exactly four bits or that every CPU has an efficient kernel for it.

Ordinary GGUF quantization families, importance-aware variants, GPTQ, AWQ and additive/codebook methods have different calibration and execution paths. A published quality result for one method is not evidence that its model is directly usable by the same GGUF runtime.

The 2026 on-device evaluation studied 0.5B–14B models and multiple PTQ methods, including a 16 GB i7-1360P laptop. It found strong size/precision interactions and worsening quality at aggressive precision. Its reported threshold is empirical for that study; it does not rule out models trained specifically for binary weights. [On-device evaluation, revision 5](https://arxiv.org/html/2505.15030v5).

**Experiment:** for the same model revision, compare Q8 or F16 as an available reference, Q5/Q4 candidates, and one more aggressive format. Match templates, sampling, context and tool schema. Measure correctness before selecting the fastest format; include identifier fidelity, structured calls, numerical constraints and multi-file consistency.

**Decision:** Q4 is a starting control, not a universal optimum. On some CPUs a larger format with better kernels can win. Do not quantize an already lossy artifact again when a suitable original checkpoint is available.

## M06. Importance calibration and selective tensor precision

Importance calibration records activation-dependent statistics so quantization can spend error where it matters less. The calibration set should resemble intended tasks without including evaluation answers. Coding-only calibration can damage general behavior; broad text may underrepresent code, tool schemas and exact identifiers.

The current [llama-imatrix documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/imatrix/README.md) supports calibration and combination of statistics. It also treats output/embedding calibration separately. This is evidence for a available preparation mechanism, not proof that our own calibration beats a reputable published quant.

**Proposal:** compare a published artifact with a locally prepared quant using a curated code/tool/general mixture, if benchmark failures point to quantization. Try higher precision for sensitive tensors only when the converter and backend support the exact arrangement.

**Experiment:** hold model, calibration token count and benchmark set fixed; vary calibration mixture and selected tensor precision. Record resulting file size, task success, exact-name errors and generation latency. Reject a seemingly better perplexity result that harms actual coding or tool behavior.

**Decision:** use audited published quants first. Custom calibration becomes justified by a diagnosed failure, not by its availability.

## M07. Quantization-aware training, QAD and distillation for low precision

PTQ compresses a trained model; QAT exposes training to quantization so representations can adapt. QAD additionally uses teacher behavior during quantized training. These procedures can move the quality–size frontier, especially at low bit widths, but are not interchangeable model conversion flags.

[ParetoQ](https://arxiv.org/abs/2502.02631) found that its lowest-bit models underwent substantial representational change and compared precision regimes under controlled training. That supports evaluating specially trained low-bit checkpoints separately from aggressively compressed ordinary checkpoints. It does not make retraining a foundation model an economical first project.

**Experiment:** compare a trained low-bit model against a conventional model with a similar total runtime memory budget, then against a similarly capable model. Both comparisons matter: a same-parameter contest can unfairly ignore a smaller conventional model that solves the task faster.

**Decision:** consume existing trained checkpoints first. Training belongs after we have stable tasks, failure traces and a clear target. Include teacher licensing, compute, data curation, evaluation and ongoing maintenance in that decision.

## M08. Binary and ternary models as a practical experiment

Bonsai 8B documents binary Q1_0 weights with one sign bit plus one F16 scale per 128 weights, or 1.125 effective bits per weight. It reports roughly 1.15 GB of parameter memory and a slightly larger GGUF file. This saves weight traffic and capacity; it does not imply that activations, attention, sampling or every operation becomes one-bit arithmetic. [Bonsai 8B model card](https://huggingface.co/prism-ml/Bonsai-8B-gguf/raw/main/README.md).

The earlier Bonsai generation's binary Q1_0 and official group-64 ternary Q2_0 have upstream runtime support described in the [current compatibility guide](https://github.com/PrismML-Eng/Bonsai-demo/blob/main/Bonsai1_README.md). Per-backend optimized coverage still matters.

**Experiment:** put binary 4B/8B and a fitting ternary checkpoint into the same coding/general suite as conventional Q4 candidates. Measure full memory, prompt speed, sustained decode, false tool calls, repair rate and complete-task latency. Compare short and long prompts because compressing weights can expose attention and output-head work as the new bottleneck.

**Decision:** high-priority experiment after baseline. Promote based on our tasks, not an averaged vendor capability score. Low weight size makes this promising enough to test; it does not establish frontier coding equivalence.

## M09. A GGUF must have a behavioral compatibility contract

A dangerous concrete case exists in the Bonsai format history: legacy and current Q2_0 layouts can use the same numeric type ID with different group layouts. Newer Bonsai 2 artifacts also require activation transforms. The project documents a development Q2_0 artifact that upstream may load while producing gibberish because the required transform is absent. [Format and runtime compatibility record](https://github.com/PrismML-Eng/Bonsai-demo/blob/main/MODEL-FORMATS.md).

**Proposed import record:** artifact SHA-256; origin and revision; license; architecture; exact tensor formats and required transforms; tokenizer and special-token identities; chat-template hash; runtime build/backend; tested context; output/sampling defaults; capabilities for tools, FIM, grammar, caching, rollback, adapters and speculation. Record declared, tested and unsupported states separately.

**Import probes:** load and generate a basic known-answer response; tokenize/decode special tokens; stop at expected boundaries; execute a harmless structured-call fixture; verify deterministic edit formatting where supported; compare cache resume against fresh execution; test cancellation. A few probes detect incompatibility, not broad intelligence.

**Experiment:** deliberately present an incompatible runtime/profile pair and require a clear rejection before a real task. Changing weights, template, adapter, transform or runtime invalidates the relevant evidence and caches.

**Decision:** pluggability means a stable host interface with capability checks, not a promise that any file with the same extension can support every operation.

## M10. Lookup-table kernels such as T-MAC

Low-bit weights can index tables of partial activation sums instead of repeatedly dequantizing and multiplying. This can reduce arithmetic and energy when the table layout, SIMD instructions and matrix shapes fit the hardware. Table construction, cache pressure and packing overhead can offset the gain.

[T-MAC's official repository](https://github.com/microsoft/T-MAC) provides implementations and model-specific kernel preparation. Its headline comparisons use an older llama.cpp baseline and selected devices; the repository also cautions about older x86 hardware. Therefore those multipliers cannot be attached to the current design.

**Experiment:** only after profiling identifies low-bit kernel cost, compare the specialized runtime against the current pinned generic backend on the same hardware, model behavior, prompt lengths and precision. Include conversion, startup, dependencies, battery energy and sustained operation. Require enough repeated requests to amortize preparation.

**Decision:** keep an inference-adapter seam that permits this experiment. Do not maintain a custom kernel fork before proving a meaningful benefit beyond today's upstream kernels.

## M11. Sparse activation and flash-resident weights

Activation sparsity can skip unused neurons. A system can keep frequently used weights in RAM and fetch colder weights from storage; layout and contiguous reads determine whether this is economical. Apple's [LLM in a Flash](https://machinelearning.apple.com/research/efficient-large-language) combines predicted sparsity, temporal reuse and flash-oriented bundling. Its comparison is against naive loading approaches. PowerInfer similarly exploits activation locality with specialized heterogeneous execution. [PowerInfer implementation](https://github.com/Tiiny-AI/PowerInfer).

**Break-even model:** let D be bytes fetched per generated token and B the sustained effective storage bandwidth. D/B is already a lower-bound transfer component, before I/O latency and compute. At a hypothetical 3 GB/s, fetching 1 GB per token consumes about 333 ms just in ideal transfer. Small random reads are worse. Ordinary OS swapping is not this research mechanism.

**Requirements:** sparse-compatible trained model, sufficiently accurate activation prediction, specialized layout and kernels, and acceptable cache hit rates. Modern dense activations do not become cheaply skippable merely by applying a threshold.

**Experiment:** compare the specialized larger model against the strongest entirely resident model that fits. Include quality, first-token delay, storage traffic, sustained temperature and p95 latency during topic changes.

**Decision:** defer. It solves a capacity problem with substantial integration cost; our first speed target favors fitting the working set in RAM.

**Mobile follow-up:** [PowerInfer-2](https://arxiv.org/html/2406.06282v3) adds neuron-cluster scheduling across NPU/CPU and pipelines storage with computation. Its published tests use 16 GB and 24 GB OnePlus phones, sparse-compatible models and specified offloading regimes. This is valuable evidence for phase-aware heterogeneous scheduling, but it does not establish that an ordinary 8 GB laptop can reproduce the headline throughput with an arbitrary GGUF. A compatible engine and model, current-baseline comparison and whole-task test remain prerequisites.

## M12. Pruning, distillation and adapters

Unstructured zeros save arithmetic only if the runtime uses an effective sparse kernel. Structured pruning removes dimensions or layers, but requires a compatible resulting architecture and usually recovery training. Distillation transfers selected teacher behavior into a smaller model; it can improve our fixed workflows without preserving every general capability.

Adapters can specialize behavior with comparatively small additional weights. They do not automatically reduce base-model inference cost. Unmerged adapters may add operations; merged ones create a new artifact, potentially requiring requantization and reevaluation. Changing adapters must invalidate model-state caches.

**Proposal:** after collecting consented, successful task traces and held-out failures, consider a compact planner or edit specialist trained off-device. Retain a general path for unfamiliar tasks. TinyAgent's released local models were trained for a specific tool collection, which is precisely why specialized tool scores should not be interpreted as arbitrary-tool capability. [TinyAgent implementation and limitations](https://github.com/SqueezeAILab/TinyAgent).

**Experiment:** freeze an evaluation set before training, separate by repository and task family, and include new tool names and schema changes. Measure whether reduced output, fewer repairs or improved success repays routing and maintenance. Reject memorization of benchmark patches.

**Decision:** later specialization, not foundation-model training as the initial architecture.

## M13. Model routing and swapping

A smaller first model is beneficial only if successful cheap attempts save more than failed attempts, validation and model-switch overhead cost. Let c_s be small-model attempt cost, v verification cost, e the escalation fraction, L swap/reload/context rebuild, and c_l the larger attempt. A simplified cascade costs:

c_s + v + e × (L + c_l).

It beats always using the larger model only when that expression is below c_l at an acceptable final error rate. If c_s=4 seconds, v=1, L=8 and c_l=12, escalation must be below 35% just to beat 12 seconds. This is an illustrative derivation; neither task quality nor real timings are supplied by these numbers. The 35% example assumes the same larger-model cost for ordinary and escalated tasks and excludes switching back before a later request. Real routing must use the larger model's conditional cost on escalated tasks, which are often harder, and include return switching, context rebuilding and correlated failures over the complete request sequence.

Model confidence alone is a weak escalation signal. Use observable features such as unsupported operations, failed validation, unresolved symbols, missing evidence and task class. Keep the currently useful model resident across related requests; evaluate hysteresis so alternating task types do not cause continuous swaps.

Model cascades are established in API settings, but local weight loading and page-cache disruption add costs absent from simple API-price routing. [FrugalGPT](https://arxiv.org/abs/2305.05176).

**Experiment:** compare one general model, explicit user-selected models and a measured cascade under realistic task sequences, including alternating code/general requests. Count wasted work and cache eviction.

**Decision:** one resident model is the initial policy; pluggability does not require simultaneous residency. Add automatic routing only when its total cost wins.

## M14. Thinking budgets and model-specific control tokens

Reasoning tokens consume latency and memory even when not shown to the user. Some models support an explicit non-thinking mode or bounded reasoning; others rely on always-thinking templates. Arbitrarily deleting template tokens or cutting a reasoning trace can damage tool syntax and answer quality.

Qwen3.5 exposes model-specific generation guidance. Liquid's 2.6B card states that it always reasons before answering and explicitly discourages agentic coding and knowledge-heavy tasks despite promoting broader tool use. These distinctions are part of the model contract, not a global “thinking off” setting. [Qwen model guidance](https://huggingface.co/Qwen/Qwen3.5-4B), [Liquid 2.6B model card](https://huggingface.co/LiquidAI/LFM2.5-2.6B).

**Experiment:** compare documented modes and output budgets on simple tool tasks, bounded edits and difficult fixes. Record first useful action separately from first emitted token. Ensure cutoff paths yield an explicit incomplete result instead of applying truncated code.

**Decision:** task-specific bounded budgets with tested templates. More reasoning is an escalation option after a concrete failure, not permanent overhead for a file lookup.

## M15. Multimodal brains and optional components

A vision-capable model may need a separate projector or encoder, image processing buffers and many image tokens. Audio adds its own front end and streaming workload. Model weights alone therefore understate the cost of activating a modality.

**Proposal:** keep text coding as the default resident path; load optional encoders only for a requested task, with explicit scheduling and memory admission. For documents with accessible text, use native extraction first. For data analysis, let a typed query or program calculate the result, and let the model explain verified outputs. OCR is a fallback for image-only content, not a compulsory first step.

**Experiment:** compare text extraction, OCR and multimodal ingestion on scanned pages, native PDFs, tables and screenshots. Measure factual extraction accuracy, token count, load/unload latency and the delay imposed on an ongoing coding task.

**Decision:** reuse the same coordinator and evidence store, but do not impose permanent multimodal residency on the smallest laptop tier.

## M16. Candidate tournament and artifact policy

This is a deliberately small candidate set. Published sizes are approximate decimal artifact or parameter sizes, not peak memory measurements.

| Candidate | Why include it | Main risk or constraint | First comparison |
| --- | --- | --- | --- |
| Qwen2.5 Coder 1.5B Instruct Q4_K_M, about 1.12 GB | Small code-specialized control; conventional attention | May need more turns or fail harder tasks | Bounded edits and tool-format reliability |
| Qwen3.5 2B Q4_K_M, about 1.28 GB | Small general/coding hybrid candidate | Template, state and backend support need probing | Complete coding/general tasks |
| Qwen3.5 4B Q4_K_M, about 2.74 GB | More capable candidate within a plausible 16 GB budget | Extra weight traffic and workspace; cannot assume 8 GB fit with developer tools | Quality–latency frontier against 2B |
| Earlier-generation Bonsai binary 4B/8B | Much lower weight traffic and capacity | Exact runtime format; task quality; growing KV | Same total memory budget as conventional models |
| Earlier-generation ternary Bonsai 8B Q2_0_g64, about 2.31 GB | Alternative if binary loses too much quality | More traffic; exact artifact identity | Binary versus ternary versus conventional Q4 |
| LFM2.5 QAD small checkpoints | Quantization-aware/hybrid efficiency experiment | Custom license; 2.6B is not recommended for agentic coding; reasoning overhead | Restricted extraction/tool/general slice |
| BitNet 2B-4T | Native ternary baseline and specialized CPU runtime lead | Coding evidence weaker than some small conventional comparators; runtime choice | Optional mechanism control, not default |

Artifact sources: [official coder GGUF](https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF), [Qwen3.5 2B GGUF](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF), [Qwen3.5 4B GGUF](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF), [ternary files](https://huggingface.co/prism-ml/Ternary-Bonsai-8B-gguf/tree/main), [Liquid QAD methodology](https://www.liquid.ai/blog/qad), [BitNet model card](https://huggingface.co/microsoft/bitnet-b1.58-2B-4T).

**License policy:** default bundles favor verified permissive licenses. Optional custom-license imports retain their license and provenance. Downloadability is not permission to redistribute or retrain.

**Selection protocol:** eliminate incompatible artifacts first; eliminate unacceptable task quality second; compare latency, memory and energy among the survivors. Keep one stable default per measured hardware/workload tier. Add another model only if it expands the useful frontier enough to repay download size, disk use, switching and support.

## M17. What would change these recommendations

The following evidence would justify changing the architecture: a specialized low-bit engine wins on current target hardware at equivalent task quality; a hybrid profile preserves correctness under required cache/rollback operations; an NPU backend supports the actual preferred model and beats CPU/iGPU after compilation and transfer costs; a compact task-trained model reliably eliminates expensive turns; or a larger fitting model reduces failures enough to beat a faster small model.

A leaderboard average, a model fitting once, an isolated kernel speedup, and a high-end-device tokens-per-second claim are insufficient by themselves. The final choice is the result of the benchmark design, not a branding decision.
