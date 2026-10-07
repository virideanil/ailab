# Laptop inference mechanisms and hardware qualification dossier

> Research snapshot: 7 October 2026. [Original Page](https://chatgpt.com/space/page_51f6c33d259081919447b3eab856d66d). This document records evidence, hypotheses, and proposed experiments. Implemented scope is described in the [repository README](../../README.md); proposals are not measured product capabilities. The [evaluation contract](evaluation-contract.md) governs qualification where older research language differs.

This dossier specifies how a pluggable GGUF runtime should use an ordinary laptop with 8–16 GB RAM. Its central decision is to qualify a complete hardware profile: model artifact, runtime build, CPU or accelerator backend, context and state layout, thread policy, and competing-work limits. A model that fits on disk can still exceed resident memory; a faster decode kernel can still produce a slower completed task.

Evidence cutoff: **7 October 2026**. “Implemented” below means present in the cited live source or documented backend, not validated on every machine. “Derived” means an engineering calculation under explicit assumptions. Proposed thresholds are experiment gates, not published speedups. No performance number here is a measurement of the user's laptop.

The primary objective is **time to a correct completed operation**, with first-use latency, tail latency, memory pressure, sustained energy and editor responsiveness as constraints. The [main architecture and roadmap](architecture.md) defines the application around this runtime.

## 1 Separate the phases before choosing an optimization

**Derived cost model.** Let P be uncached prompt tokens, N generated tokens, C the attention history, U the physical microbatch, and B concurrently decoded sequences. A useful decomposition is:

`Trequest = Tqueue + Tload + Ttokenize + Tcontext + Tprefill(P, U) + sum[Tstep(C+t, B)] + Tsampling + Ttools + Tverify + Trepair`

A prefix cache reduces P; concise output reduces N; low-bit weights and kernels reduce some of Tstep; smaller microbatches can reduce scratch memory while increasing Tprefill. These effects should not be mixed into one “tokens per second” score.

A second useful quantity is `expected time per accepted task ≈ total elapsed time over all attempts / accepted tasks`. Include failed attempts and bounded repairs. Cross-model tokens are not identical units because tokenizers and verbosity differ. An implementation can double raw token throughput yet lose if it generates twice as many tokens or needs more repairs.

**Experiment.** Time a short typed action, a fresh 512-token request, a fresh 2K-token request, a warm prefix continuation, and a small code edit through the complete API. Record stage timings and output tokens. Do not optimize a phase contributing only a small fraction of the actual latency: if fraction f improves by factor s, the maximum total speedup is `1 / ((1-f) + f/s)`.

**Gate.** Identify the dominant stage separately for interactive actions, long edits and background work. Preserve the original workload distribution when comparing profiles.

## 2 The roofline explains why decode and prefill need different kernels

**Derived dense-layer model.** For Plinear weights and m tokens, a linear layer performs about `2 × Plinear × m` nominal arithmetic operations. If effective weight precision is q bits including scales, one ideal weight read costs `Plinear × q / 8` bytes. With successful reuse across tokens:

`arithmetic intensity ≈ 16m/q operations per weight byte`

At 4.5 bits, this is about 3.56 operations/byte for m=1 and 114 for m=32. These are accounting bounds; unpacking, scales, activations, cache misses and actual kernel tiling add costs.

For one inference step, an optimistic lower bound is `max(F / Peffective, D / BWeffective)`, before non-overlapped launch, synchronization and sampling overhead. F is actual work and D is traffic through the limiting memory level. Effective compute and bandwidth must be measured for the selected kernel and sustained power state. Vendor TOPS and advertised DRAM bandwidth are not substitutes.

A hypothetical dense model streaming 2.5 GB of weights through 40 GB/s effective bandwidth has a weight-only ceiling of 16 steps/s. Longer-context attention, state updates and other traffic reduce it. This example is neither a prediction nor a hard ceiling for models fitting in cache, sparsely activated models, or speculative verification that amortizes weight reads.

**Benefit conditions.** Smaller weight traffic matters most for bandwidth-bound decode. GEMM tiling matters more when multiple prompt tokens reuse weights. Extremely compressed weights can shift the bottleneck toward unpacking, reductions, softmax, logits and synchronization.

**Experiment and gate.** Compare thread scaling, context-depth scaling and prefill batch scaling. Use bandwidth counters where supported. A plateau in decode throughput with increasing threads is a reason to stop adding workers, not a reason to assume the runtime is broken.

## 3 Quantization is a numerical representation and a kernel contract

**Implemented.** Q4_0 stores 32 weights plus a half-precision scale in 18 bytes, or 4.5 effective bits/weight. Q4_K uses 256-weight superblocks with subblock scale/minimum data and also averages 4.5 bits/weight. Q8_0 uses 34 bytes for 32 values. Thus “four bit” does not mean precisely half a byte per value, and two formats of the same bit rate can have different unpack costs. [Quantized block definitions](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-common.h)

Q4_K_M is a whole-model recipe selecting different types for different tensors. It is not one homogeneous 4-bit arithmetic path. The relevant input to memory accounting is the actual tensor inventory, including embedding and output tensors. [Quantizer implementation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-quant.cpp)

**Mechanism.** A fused low-bit dot kernel generally extracts packed codes, converts or quantizes activations as required, performs vector integer dot products, and applies block scales during accumulation. It need not expand the whole model to FP16 or FP32. More complicated scale/minimum handling can cost instructions; reduced weight traffic can still dominate.

**Failure modes.** More aggressive quantization can damage rare identifiers, numerical reasoning, instruction following or tool arguments. Perplexity alone does not certify these behaviors. A model-specific trained low-bit checkpoint is a different candidate from mechanically requantizing arbitrary weights.

**Experiment.** Compare Q4_0, Q4_K_M and one higher-precision candidate from the same base checkpoint. Preserve prompts, context, sampler and task checks. Record artifact bytes, tensor types, peak allocations, latency and failures. Then retune threads only for finalists.

**Gate.** Select the fastest profile that clears the task-quality floor. Reject a smaller file when wrong answers or additional repair turns erase its resource advantage.

## 4 SIMD and ISA dispatch are specific to the actual machine

**Implemented.** The x86 kernels use AVX-family loads, unpacking, sign handling and multiply-add reductions; VNNI paths can combine part of the integer dot-product reduction. They still need data movement, scale processing and accumulation. [x86 repacked kernels](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-cpu/arch/x86/repack.cpp)

Arm paths distinguish NEON, dot-product instructions and I8MM matrix instructions, with layouts that make their data access useful. [Arm repacked kernels](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-cpu/arch/arm/repack.cpp)

CPU variant scoring checks compiled features against available processor features. This selects a compatible implementation; it is not a measured workload autotuner. [x86 feature scoring](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-cpu/arch/x86/cpu-feats.cpp)

**Requirements.** Package either compatible runtime variants or a build targeted at the actual laptop. A build optimized for the developer's newer machine can be unusable on the target. Current CMake treats native compilation and dynamic variant configuration as distinct options with compatibility checks. [CPU build configuration](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-cpu/CMakeLists.txt)

**Experiment.** Record the CPU topology, reported ISA features, selected backend variant and exact compiler/build options. Compare equivalent release builds only when a plausible missing kernel exists. Do not start by compiling every possible ISA combination.

**Gate.** Retain the portable configuration unless a correctly targeted build provides a repeatable task-level gain. Never infer a proportional speedup from SIMD register width or TOPS.

## 5 Repacking and tiled matmul interact

**Implemented.** Current repack dispatch supports both Q4_0 and Q4_K. AVX2 can choose 8×8 layouts for both when output rows are divisible by eight. Arm I8MM and dot-product paths select their own layouts and divisibility requirements. Repacking interleaves compact blocks into a kernel-friendly representation, requiring a transformation and potentially a new allocation at load time. [Repack dispatch](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-cpu/repack.cpp)

A separate default-enabled tiled CPU path handles supported K-quant and IQ formats. Its usual activation-row threshold is at least eight; it allocates about 512 KiB of scratch per worker plus other workspace. **It bypasses repacked weight buffers.** Therefore a repack on/off comparison can switch the kernel family, not only the memory layout. [Tiled matmul source](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-cpu/tiled/tiled.cpp)

**Benefit conditions.** Repacking can improve repeated low-bit operations when its layout matches the CPU and tensor shapes. Tiled matmul can improve prompt batches through reuse. Neither guarantees a win for all model matrices.

**Experiment.** Use the same model artifact and run production defaults, then `--repack 0` versus `--repack 1` in llama-bench. If the result needs diagnosis, repeat with `GGML_CPU_TILED_MM=0`. Keep `GGML_CPU_TILED_MM_FORCE` out of the production profile; forcing a kernel beyond its profitability gate is a diagnostic.

**Gate.** Compare cold transformation time, peak memory, short decode and long prefill separately. A faster warm decode profile may lose for occasional one-shot requests; a faster prefill profile may be unsuitable for an 8 GB machine if scratch causes pressure.

## 6 BLAS and KleidiAI are conditional accelerators

**Implemented BLAS behavior.** The generic BLAS path requires contiguous eligible operands, F32 activations and relevant dimensions of at least 32. It expands non-F32 weight tensors into an F32 workspace before SGEMM. Workspace capacity can be reused, but the operation still performs conversion. A hypothetical 4096×4096 tensor occupies 64 MiB in F32 versus 9 MiB at 4.5 bits. Large prompt batches can amortize conversion; single-token decode does not satisfy this large-matrix path. BLAS also brings library-specific threading into the profile. [BLAS source](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-blas/ggml-blas.cpp)

**Implemented KleidiAI behavior.** Current Arm integration covers relevant Q4_0, Q8_0 and F32 paths, selects GEMV/GEMM kernels using feature and shape checks, and can retain a primary packed representation plus a fallback packed representation. SME worker limits and platform feature discovery affect dispatch. Therefore the GGUF file does not bound resident packed-weight memory. [KleidiAI integration](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-cpu/kleidiai/kleidiai.cpp)

Build support alone does not establish execution of the fastest kernel. The build guide describes runtime feature, type, shape and backend-priority selection, including SVE-length qualifications. [Build documentation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/docs/build.md)

**Experiment.** Compare the ordinary CPU baseline with one eligible BLAS or KleidiAI candidate. Use short and long prefills, actual decode, warm and cold launches, and peak resident memory. Preserve normal runtime defaults before testing diagnostics.

**Gate.** Keep only the accelerator that improves the intended phase enough to improve accepted-task latency or energy. A 2K-token prefill gain does not justify added memory for a workload consisting of 30-token cached actions.

## 7 Thread pools and heterogeneous cores must follow the phase

**Implemented.** Generation and prompt processing have separate thread controls, masks, strict-placement settings and polling controls. Current common code creates distinct persistent pools where configurations differ. On Linux x86, default math-core discovery includes logic for SMT and hybrid CPUs; choosing a count is not equivalent to permanently pinning workers. [Common runtime setup](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/common/common.cpp), [argument definitions](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/common/arg.cpp)

The native pool combines polling with sleep/wake behavior, and operators use synchronization barriers. More workers can add wakeup, coordination and memory contention. Slower efficiency cores can become stragglers for synchronized work. **The current Apple affinity function is a no-op**, so `--cpu-mask` is not a macOS P-core guarantee. OpenMP builds have a different worker path. [CPU scheduling implementation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-cpu/ggml-cpu.c)

**Derived model.** A parallel operator behaves roughly like `max(worker work times) + coordination + shared-memory contention`, not serial work divided by logical CPU count. A memory-bound decode can saturate before all cores are busy; compute-heavy prefill can benefit from additional cores.

**Experiment.** Sweep decode threads through 1, 2, 4 and useful physical-core counts, refining near the best. Tune prompt threads independently. Where affinity is supported, compare default scheduling against verified P-core masks; do not assume CPU numbering. Compare polling defaults with reduced polling for battery and idle energy. Record OpenMP status and any BLAS threads to expose oversubscription.

**Gate.** Choose a throughput plateau's lower-worker profile when latency is equivalent and energy/responsiveness improves. Avoid elevated real-time priorities as a substitute for resource scheduling.

## 8 Memory mapping changes loading and residency

**Implemented.** On Linux the mmap path uses shared read-only mappings, sequential file advice, optional MAP_POPULATE and WILLNEED prefetch; lazy ranges receive different advice. Windows uses its own file mapping/prefetch facilities. The mlock path can fail system resource limits and reports failure. [Model mapping and locking source](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-mmap.cpp)

A successful ordinary `mlock` makes the covered pages resident and prevents eviction until unlocked. It is not merely a hint and does not increase RAM capacity. [Linux mlock semantics](https://www.man7.org/linux/man-pages/man2/mlock.2.html)

**Mechanism.** A memory mapping creates a virtual view of file-backed pages. A warm file page already in the OS cache can be reused without a fresh SSD read. A nonresident page requires a fault and storage access. In-memory model reuse, warm file-cache reload and cold storage load are therefore three different states.

**Derived memory budget.**

`Mpeak = resident weight representations + allocated KV + recurrent states + saved checkpoints + compute and conversion scratch + host/device duplication + tokenizer/logits/runtime + application/tools + required OS headroom`

Do not add aliased CPU/GPU pages twice, but do include real duplicate representations. Conversely, virtual address size and file size cannot stand in for resident memory.

**Failure cases.** File-backed weight pages can be repeatedly evicted under pressure. This can resemble poor compute throughput while the process is waiting for I/O. Locking a model on a small laptop can move the pressure onto the editor or browser. Repacking or device upload can destroy the hoped-for zero-copy path.

**Experiment.** Compare `--load-mode auto` or mmap with an explicitly supported non-mmap profile, and mlock only if residency losses are observed with available headroom. Record startup stages, major faults, storage reads, memory pressure and warmed request latency. Do not flush the whole machine's page cache during normal interactive work.

**Gate.** Prefer one warm resident model when used frequently. Reject a profile that relies on ongoing paging, even if its isolated first benchmark finishes.

## 9 CPU and integrated GPU memory paths are backend specific

**Implemented.** Metal on unified-memory Apple devices uses shared buffers and can wrap existing mapped pages with `newBufferWithBytesNoCopy`. Other private-buffer/copy paths also exist. Device memory accounting uses the recommended GPU working-set limit rather than a separate physical VRAM pool. [Metal allocation source](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-metal/ggml-metal-device.m)

Current Vulkan capabilities advertise `buffer_from_host_ptr=false` and `mmap_support=!is_integrated_gpu`. Its UMA allocator prefers device-local, host-visible, coherent memory but can still copy into buffers; GPU-to-host visibility can require barriers and fences. This is shared physical RAM, not proof of a zero-copy file-mapping path. [Vulkan capability source](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-vulkan/ggml-vulkan.cpp), [Vulkan buffers](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-vulkan/ggml-vulkan-buffers.cpp)

SYCL advertises mmap support but no direct host-pointer buffer capability. Its ordinary device allocation and optional system-USM path are distinct; USM and graph execution options require supporting build/runtime/device combinations and are not blanket defaults. The current implementation includes Gated DeltaNet and recurrent-cache work, so blanket rejection of all hybrid models on SYCL is wrong. [SYCL implementation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-sycl/ggml-sycl.cpp)

The SYCL documentation targets Intel devices, including modern integrated Arc and 11th-generation-and-newer iGPUs. Its caution about older low-EU devices is not a universal cutoff across generations. Driver support and the exact model graph matter. [SYCL backend documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/SYCL.md)

**Mechanism.** A shared memory controller offers one bandwidth budget. CPU and iGPU activity can compete for that budget and package power. Copies, synchronization, device residency and driver overhead remain even without a discrete GPU's PCIe transfer.

The loader may upload from a mapped file then unmap unused ranges, or use staging with non-mmap loading. Therefore neither permanent double-residency nor universal zero-copy is a valid assumption. [Model loading implementation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-model-loader.cpp)

**Experiment.** Compare CPU-only with full Metal or Vulkan offload where available, plus SYCL on eligible Intel hardware. Capture selected load mode, buffer allocations, steady and peak system memory, cold loading, prefill and decode at several depths. Verify actual device placement.

**Gate.** Choose the measured latency/energy winner within the same physical RAM envelope. Reject iGPU acceleration that merely moves the bottleneck to synchronization, allocation pressure or shared-memory contention.

## 10 Partial offload introduces graph boundaries

**Implemented.** GGML partitions execution across backends, creates copies for incompatible input placement, and synchronizes using events or backend synchronization. Unsupported operations can add splits. [Backend scheduler](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-backend.cpp)

**Derived model for a dependent layer chain.**

`Tstep ≈ sum(Tcpu layers) + sum(Tgpu layers) + sum(Tboundary)`

A boundary can include dispatch, synchronization, layout conversion and a copy. CPU and GPU layers for the same token are generally dependent, so partial offload does not simply add their peak compute rates. On integrated devices, lower transfer cost does not eliminate the dependency.

Metal can overlap CPU command encoding with early GPU execution, and its current code cautions that increasing extra command buffers beyond two can degrade performance. This is another case where more host parallelism is not automatically useful. [Metal command execution](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-metal/ggml-metal-context.m)

**Requirements.** Verify the entire operator graph and actual cache placement, not just the configured `-ngl` count. Keep a contiguous layer placement where possible. KV offload changes attention execution as well as storage.

**Experiment.** Run CPU-only, full offload, and only then a small partial-layer sweep if either memory or latency suggests it. Record graph splits and fallback operators. Compare realistic short prompts and longer prefills rather than assuming one placement wins both.

**Phase splitting hypothesis.** GPU-prefill/CPU-decode handoff is worth further work only when:

`CPU prefill time − GPU prefill time > handoff + reconfiguration + added contention`

State transfer, layout compatibility and duplicated weights belong in that accounting. This condition does not establish that the current server exposes a cheap automatic handoff.

**Gate.** Keep partial offload if it beats both relevant endpoint configurations for the actual task or makes an otherwise useful profile fit without paging. Defer custom phase splitting until its attainable saving exceeds integration and state-management cost.

## 11 NPU acceleration is a compiled model and workflow profile

**Implemented with restrictions.** The current llama.cpp OpenVINO backend compiles translated GGML graphs. Its NPU path uses static graphs, fixed prefill chunks, one sequence, and a primarily Q4_0-oriented quantization path; some tensors are requantized or expanded, including FP16 token embeddings. The documented matrix passes selected Qwen3 small models but fails Qwen3.5 0.8B/2B/4B/9B on NPU. Validation used a 32 GB Lunar Lake machine. CPU/GPU stateful execution has separate rewind, restoration and context-shift limitations. [OpenVINO backend documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/backend/OPENVINO.md)

The translator also imposes Gated DeltaNet restrictions involving state snapshots and input layouts. A single successful generation does not qualify edited-prefix or speculative rollback workflows. [OpenVINO translation source](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/ggml/src/ggml-openvino/ggml-openvino.cpp)

Intel's wider NPU documentation describes restricted experimental bounded dynamic-shape support for specified newer devices/drivers and vision workloads. That is not evidence of general dynamic LLM support. Compiled-blob compatibility is also version/platform dependent. [Intel NPU documentation](https://docs.openvino.ai/2026/openvino-workflow/running-inference/inference-devices-and-modes/npu-device.html)

**Derived amortization test.** If warm execution saves ΔT per request but adds compilation/setup cost C, the profile requires more than `C/ΔT` relevant requests before that setup is repaid. If ΔT is zero or negative, compilation never pays back through latency alone. Energy can have a separate break-even.

**Experiment.** On an actually supported laptop, test only an exact supported model/profile. Measure first-ever compile, next cold start with cache, warm request, changed context shape, edited-prefix continuation and cancellation. Record expanded tensor memory and build/driver identifiers. Validate that the requested device was used; an explicit application CPU fallback must report its real backend.

**Gate.** NPU becomes a candidate when it preserves the intended state workflow and repays compilation, integration and memory cost. Do not buy hardware or convert the architecture around NPU TOPS. A later small embedding/classifier profile is justified only if that task is a measured bottleneck.

## 12 KV cache has a calculable cost and a separate quality tradeoff

**Derived memory formula for ordinary full attention.** For layer l, let C_l be allocated cache cells, Hkv_l KV heads, dK_l and dV_l head dimensions, and sK/sV effective bytes per stored scalar:

`Mkv ≈ sum_l[C_l × Hkv_l × (dK_l × sK + dV_l × sV)]`

Account separately for padding, streams, sliding windows, shared layers and special architectures. Current llama.cpp allocates layer caches using their actual GQA widths and chooses CPU or the layer's device buffer according to offload policy. [KV allocation source](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-kv-cache.cpp)

For **Qwen3-4B**, the official configuration has 36 layers, eight KV heads and head dimension 128. Thus F16 K+V costs 144 KiB per token before overhead. [Official model configuration](https://huggingface.co/Qwen/Qwen3-4B/raw/main/config.json)

| Allocated context | F16 K and V | Q8_0 K and V | Q4_0 K and V |
| --- | --- | --- | --- |
| 4096 tokens | 576 MiB | 306 MiB | 162 MiB |
| 8192 tokens | 1152 MiB | 612 MiB | 324 MiB |

These are derived tensor-storage figures, not full-process measurements. Q8_0 uses 34/32 bytes per value and Q4_0 uses 18/32, including scales.

**Mechanism and break-even.** A decode step reads historical K and V; longer history adds bandwidth and attention work even when weights are unchanged. Compressing KV can help if saved traffic or avoided paging exceeds quantize/dequantize and alternate-kernel costs. At short context, a weight-bound model may gain little.

**Quality qualification.** Cache precision changes attention numerics. KIVI's research found different quantization characteristics for keys and values, but its particular asymmetric algorithm and results do not certify llama.cpp's ordinary Q4_0 cache. [KIVI, ICML 2024](https://proceedings.mlr.press/v235/liu24bz.html)

**Experiment and gate.** Start with F16; compare Q8_0 and Q4_0 at actual 2K/4K/8K depths using retrieval, identifiers, numeric detail and multi-turn consistency checks. Promote memory savings only when quality and backend execution remain acceptable.

## 13 Flash Attention is an IO optimization with backend constraints

**Paper mechanism, implemented through backend-specific kernels.** FlashAttention tiles attention, retains intermediate work near computation and computes softmax incrementally instead of materializing the full attention-score matrix in large memory. It preserves exact attention mathematically, subject to floating-point order. It does not remove the model's need for historical K/V or turn dense attention into constant work. The original GPU training speedups are not laptop inference measurements. [FlashAttention, May and June 2022](https://arxiv.org/abs/2205.14135)

For fresh prefill with sequence length n, a naive attention score matrix grows with n²; Flash Attention avoids that materialization. For one-token decoding at history C, scores have width C and the kernel still must consume relevant history. Gains therefore depend on phase, context, head geometry, cache type and backend.

**Implemented constraints.** Current llama-context initialization requires Flash Attention for quantized V, validates that quantization block sizes divide head dimensions, and contains model-specific restrictions. Auto mode probes scheduling compatibility; explicitly forcing a mode is not the same experiment as auto selection. [Context initialization and probing](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-context.cpp)

**Failure modes.** A valid-looking cache option can select a slower kernel or cause operations to fall back to CPU. An accelerator's support for F16 attention does not prove support for every mixed K/V type. Numerically equivalent algorithms need not produce bit-for-bit identical sampled text.

**Experiment.** Measure `-fa auto`, on and off first with F16 cache; inspect actual placement and logs. Compare supported cache combinations next. Run short prompt, long prompt and deep-context decode. Check output validity and representative task quality.

**Gate.** Keep the fastest correct supported combination, not a universal “FA plus Q4” preset. If a quantized profile falls back or fails shape checks, preserve the F16 baseline.

## 14 Hybrid recurrent models exchange growing history for state management

**Implemented architecture.** Qwen3.5-2B has 24 text layers, with full attention every fourth layer: six full-attention layers and eighteen linear-attention layers. Its attention head dimension is 256 with two KV heads; the recurrent dimensions and float32 state dtype are explicit in the model configuration. [Official Qwen3.5-2B configuration](https://huggingface.co/Qwen/Qwen3.5-2B/raw/main/config.json)

**Derived consequence.** The six F16 attention layers need 12 KiB of KV per token: 48 MiB at 4096 tokens. This is only the attention portion. It must not be compared with a full model's total RAM or generalized as a universal fourfold speedup.

Current runtime hybrid construction assigns F32 recurrent state. The recurrent allocator reserves `mem_size × (1 + n_rs_seq)` state rows when rollback snapshots are requested. It supports only bounded partial rollback under explicit conditions; ordinary recurrent history is not a per-token KV archive. [Hybrid memory construction](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-model.cpp), [recurrent allocation and rollback](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-memory-recurrent.cpp)

The convolution-state and recurrent-state dimensions are model-specific. Their cost is fixed with respect to history length for a fixed number of sequences and snapshots, but changing those counts changes memory. [State dimension calculation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/llama-hparams.cpp)

**Interactions.** Append-only conversations suit state reuse. Editing an early prefix, branching a session or rejecting speculative tokens can require restoring a state and replaying tokens. Current server checkpoints store and restore partial state, manage spacing and eviction, and maintain separate draft state. [Checkpoint implementation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/server-context.cpp)

**Experiment and gate.** Compare append-only use, changes at 10%, 50% and 90% of the prompt, and branch/restore sequences. Record replayed tokens and checkpoint memory. Promote the hybrid if its combined latency, quality and memory wins on the actual editing pattern; do not select it from a single uninterrupted generation benchmark.

## 15 Logical batches microbatches and concurrency are different controls

**Implemented semantics.** `n_batch` is the logical maximum submitted to decode; `n_ubatch` is the physical maximum chunk. `n_seq_max` counts distinct sequences and recurrent states. Generation and prompt thread counts are separate. `offload_kqv` moves attention operations including the KV cache, not merely a passive storage allocation. [Public runtime parameters](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/include/llama.h)

**Derived tradeoff.** For P uncached tokens, smaller microbatches create more chunks, roughly `ceil(P/U)`. Small U reduces peak working sets but repeats launches and can weaken matrix reuse. Large U can improve prefill throughput but raise memory and the time spent in an uninterrupted chunk. A new interactive request can suffer while a background prefill occupies shared execution resources.

Continuous batching combines ready work from multiple requests. It can amortize weight reads and improve aggregate throughput; it does not promise lower latency for the one request the user is waiting for. More active sequences also need state and may increase attention work.

**Experiment.** Start with one foreground slot. For the chosen model, test U of 64, 128, 256 and 512 only where memory permits, keeping the logical batch large enough. Compare one foreground request against the same request plus a background summarization/indexing request. Measure its p95 token gap and completion time as well as aggregate tokens/s.

**Gate.** Prefer the smallest microbatch near the useful throughput plateau when it improves responsiveness or headroom. Enable multi-request concurrency only for workload classes whose foreground latency budget survives it. Do not confuse a 512-token prefill microbatch with 512 independently decoded users.

## 16 Prefix caches are valuable only when they save more work than they retain

**Implemented.** The server can reuse an identical token prefix and evaluate the differing suffix. Current documented controls include `--cache-ram` in MiB, context checkpoints and their spacing, and explicit parallel slots. The documented cache maximum defaults to 8192 MiB, checkpoint count to 32 and slots to automatic; these are limits or policies, not proof of immediate allocation. `cache_prompt` defaults true. [Server cache controls](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md)

**Derived break-even.**

`cache value ≈ avoided prefill time − lookup/restore/replay time − latency caused by retained-memory pressure`

Keep stable instructions and tool schemas ahead of changing task material when semantically valid. Identical text is not always an identical token prefix once the chat template and boundaries are considered. Model, tokenizer, adapter, template, position scheme and cache precision are part of cache identity.

**Failure modes.** A timestamp or changing metadata at the front invalidates a valuable prefix. Persisting every history can evict model pages. Recurrent state replay makes “cache hit” insufficient as a metric. A restored numerical state is not a cached guarantee that a tool result or file revision is still correct.

**Experiment.** Measure no reuse, unchanged prefix continuation, changed suffix, early-prefix change and cold restore. Record prompt tokens processed, restored bytes, replay and memory. Test within the real editor/browser memory footprint.

**Gate.** Use a small explicit cache cap derived from spare memory. Increase it only when repeated real prefixes save more latency than the retained state costs; do not allocate an 8 GB allowance by habit on an 8 GB laptop.

## 17 Thermal power and battery behavior change the optimum over time

**Implemented platform behavior.** CPU frequency/voltage scaling and boost depend on utilization and thermal/power limits; requested maximum frequency is not a guarantee of sustained frequency. [Linux CPU performance scaling](https://docs.kernel.org/admin-guide/pm/cpufreq.html)

Apple exposes thermal-state notifications and advises reducing CPU, GPU and I/O activity as thermal pressure rises. Its archived guide distinguishes nominal, fair, serious and critical conditions, and notes that unsupported systems can report nominal. [Apple thermal guidance, updated September 2016](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/power_efficiency_guidelines_osx/RespondToThermalStateChanges.html)

**Derived model.** Dynamic switching power grows approximately with activity × capacitance × voltage² × frequency. A simple thermal model is `Cthermal × dT/dt = P − (T − Tambient)/Rthermal`. These explain why brief turbo performance and a sustained fanless session differ; they do not provide device-specific predictions without measurements.

For a memory-bound decode, raising core frequency may add energy after bandwidth saturates. A compute-bound prefill can react differently. Integrated CPU and GPU workloads may compete for package power as well as memory.

**Experiment.** Keep AC and battery results separate; record battery level, OS power mode, ambient conditions, background apps and fan policy. Run a short burst and then at least ten minutes of representative work. Sample frequency, package power where exposed, thermal condition and latency by minute. Repeat profiles in randomized order or after comparable cooldown.

Use `joules per accepted task = integrated device power over the trial / accepted tasks`, identifying whether instrumentation covers the package or whole device. Intel PCM can expose several supported power, frequency, bandwidth and thermal counters; availability depends on processor and privileges. [Intel PCM](https://github.com/intel/pcm)

**Gate.** Preserve separate AC and battery profiles. Reject a “fast” profile whose advantage disappears after stabilization, burns substantially more energy without useful latency gain, or makes the editor persistently unresponsive.

## 18 The scheduler must budget builds indexers and inference together

**Mechanism.** A compiler, language server, embedding job and model runtime compete for CPU time, DRAM bandwidth, last-level cache, storage and physical RAM. Reducing process priority addresses only part of that competition. A low-priority indexer can still evict useful file pages or saturate shared memory traffic.

Linux Pressure Stall Information measures time lost to CPU, memory and I/O scarcity at system and cgroup scope; its “some” and “full” conditions distinguish partial stalls from widespread thrashing. It can support resource-pressure triggers. [Kernel PSI documentation](https://docs.kernel.org/accounting/psi.html)

**Proposed scheduling policy.** Assign heavy phases explicit budgets. Permit cheap independent file reads alongside decode only when measurements show they remain cheap. Pause embeddings and broad indexing during foreground generation on the weakest tier. Start a heavy build when inference no longer needs the same resources, or reduce both workloads to a measured coexistence profile. Use a minimum dwell time before switching policies so the scheduler does not oscillate.

**Experiment.** Benchmark four controlled states: normal editor/browser idle load; foreground inference; inference plus one realistic build; inference plus one realistic indexing task. Then test serial scheduling and reduced-resource overlap. Measure both tasks' completion time, foreground p95 latency, memory pressure and UI event responsiveness. Do not replace the realistic jobs with synthetic CPU burn alone.

**Gate.** Overlap work only if it improves the user's relevant completion time without violating foreground latency and memory budgets. A lower total makespan is not sufficient when every keystroke stalls. Treat sustained major faults or memory-pressure stalls as a signal to shrink or defer work.

## 19 A staged benchmark avoids an expensive tuning lottery

A full Cartesian product of models, quantizations, threads, backends, context sizes, cache types and batches is wasteful. Use each result to choose the next experiment.

1. **Inventory and freeze.** Record CPU architecture, P/E/SMT topology, RAM and available memory, storage, OS, driver/runtime versions, power mode, model hash, tensor inventory, chat template and exact runtime commit/build options.

2. **Establish CPU baseline.** Explicitly select CPU execution and verify logs. Bound context and one foreground sequence. Use F16 cache first. Record the actual allocations and the complete request timings.

3. **Find the thread plateau.** Tune generation separately from prompt processing. Include normal editor/browser load. Retain two useful candidates at most.

4. **Inspect kernel choices.** Compare repacking; investigate tiled dispatch only when it explains a difference. Try BLAS or KleidiAI only on an eligible machine and workload.

5. **Compare the available accelerator.** Use the same artifact where supported. Record cold compilation/upload and warm execution separately, with partial offload only if full offload fails or loses.

6. **Tune state and microbatch.** Measure realistic context depths and prefix-edit patterns. Change KV precision only after confirming Flash Attention/backend eligibility.

7. **Compare model families.** Use the same task outcomes and resource envelope. The model switch changes quality and tokenization; it is not a pure kernel experiment.

8. **Qualify sustained interaction.** Repeated paired trials under AC and battery, including builds/indexing, followed by a sustained session.

llama-bench exposes prompt processing, generation, combined tests, context depth, repetitions and structured output. It excludes tokenization and sampling. Therefore use it for diagnosis and an end-to-end harness for product decisions. [Benchmark documentation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/llama-bench/README.md)

For each profile store cold load time; TTFT; prompt rate; decode rate at stated depth; p50 and p95 token gaps; task completion time; quality outcome; retries; peak resident and device allocations; page faults/storage activity; sustained frequency and energy where available; and cancellation latency. Preserve raw trial data, not only averages.

**Proposed promotion gate.** Predeclare a mechanism-specific minimum useful gain and a quality noninferiority criterion proportional to integration cost. A reversible thread-count change can justify a smaller repeatable gain; a custom runtime fork needs a larger sustained benefit that repays maintenance. State acceptable tail latency, memory pressure and responsiveness before testing. A 50-case seed suite finds gross defects but establishes neither a precise p95 nor two-percentage-point quality equivalence; expand observations and report uncertainty before choosing a winner.

## 20 Audit of claims that must not become product promises

| Tempting claim | Correct interpretation |
| --- | --- |
| A 2 GB GGUF uses 2 GB RAM | File bytes exclude state, scratch, alternate packing and possible device copies. |
| Four-bit cache uses exactly one quarter of F16 memory | Block scales and padding change the ratio; Q4_0 tensor storage here is 28.125% of F16. |
| Unified memory makes every backend zero copy | Physical memory topology and runtime allocation/import paths are separate facts. |
| More cores or wider SIMD always increases speed | Bandwidth, packing, barriers, thermal limits and actual ISA dispatch control the result. |
| BLAS speeds up generation | Its eligible large-matrix path can help prefill; single-token decode is a different shape. |
| Q4_0 is the only optimized CPU quantization | Current repacking and tiled kernels also optimize K-quants under specific conditions. |
| Flash Attention makes context free | It reduces attention IO/materialization; history still requires state and work. |
| Recurrent models use constant total memory | Fixed state can multiply with sequences, rollback snapshots and saved checkpoints; hybrid attention still grows. |
| A model loads successfully so it is supported | Required transforms, format versions, operator placement and known-answer behavior must be verified. |
| A warm tokens/s benchmark predicts the experience | Loading, prefill, sampling, tools, retries, contention and sustained power remain. |
| An advertised NPU TOPS figure predicts GGUF performance | Compiler/operator/model/format support and state transfer can dominate. |
| A vendor GPU speedup transfers to a base laptop | It is evidence for that published setup only. |

The initial 8 GB and 16 GB classes remain **admission targets**, not universal model-size rules. A trained binary model can have more parameters and fewer bytes than a conventional smaller model; a weak kernel or poor task accuracy can still make it the wrong choice. The selection unit is the validated model/runtime/hardware profile.

## 21 The concrete experiments and decision records

| Experiment | Control and changed variable | Primary evidence to collect | Stop or promote condition |
| --- | --- | --- | --- |
| CPU thread count | Same model and cache; vary generation then prompt threads | Decode/prefill scaling, energy, UI latency | Stop after the useful plateau; promote a stable lower-cost profile. |
| Repack versus tiled path | Same artifact; repack on/off, then tiled disabled only for diagnosis | Selected path, cold load, memory, phase latency | Keep only the appropriate production path; do not conflate layout and kernel changes. |
| BLAS or KleidiAI | Eligible backend versus ordinary CPU | Conversion/packing overhead, workspace, actual operation use | Stop if setup and memory exceed the useful prefill saving. |
| iGPU placement | CPU-only, full offload, then limited partial sweep | Device placement, graph splits, buffer copies, shared RAM peak | Promote only a task-level or energy win within the same memory envelope. |
| KV compression | F16 control, then supported Q8_0/Q4_0 at fixed context | Actual KV bytes, attention path, deep-context correctness | Reject unsupported fallback or a meaningful quality regression. |
| Microbatch sizing | Fixed logical batch; change physical chunk size | Prefill rate, peak scratch, foreground waiting | Choose the useful plateau with adequate interruption responsiveness. |
| Prefix reuse | Identical versus edited prefix with fixed model | Processed/replayed tokens, restore time, saved-state bytes | Cache only where avoided work exceeds pressure and replay cost. |
| Recurrent architecture | Task-matched dense and hybrid candidates | Quality, state bytes, append and rollback behavior | Promote on actual interactive patterns, not parameter count alone. |
| NPU compilation | Supported exact model, CPU control | Compile cold/warm costs, real backend, state compatibility | Stop on incompatible workflow or unamortized cost. |
| Resource coexistence | Inference alone versus build/index overlap | Foreground p95, both completion times, memory stalls | Serialize or reduce overlap when contention violates the foreground budget. |

A winning profile should be keyed by CPU/GPU/NPU identity, OS and driver, runtime commit/build options, model hash, tokenizer/template, tensor formats, context, cache and state types, threads, offload, microbatch and relevant power mode. Store the raw measurements, task-quality decision and known restrictions alongside it.

Profile invalidation is part of correctness: a new runtime kernel, changed driver, new model quantization or altered context can change dispatch and memory. Requalify the affected dimensions rather than rerunning every unrelated experiment.

For the 8 GB class, begin admission with the user's normal OS/editor/browser resident and one active model. For the 16 GB class, use the same measurement rule; extra RAM is headroom for useful state and tools, not permission to maximize context automatically. The selected model may differ by workload and trained compression, but simultaneous residency of several brains must earn its additional memory.

**First hardware milestone:** identify one reliable CPU profile and, if available, one accelerator challenger on the actual laptop; complete representative small tasks without sustained paging; record full phase timings and task outcomes; then optimize the measured dominant cost. This milestone produces an actionable decision before any custom kernel or speculative hardware architecture is built.
