# Local GGUF decoding and model call reduction dossier

> Research snapshot: 7 October 2026. [Original Page](https://chatgpt.com/space/page_317ca4d4d4588191b627c295836d3d1a). This document records evidence, hypotheses, and proposed experiments. Implemented scope is described in the [repository README](../../README.md); proposals are not measured product capabilities. The [evaluation contract](evaluation-contract.md) governs qualification where older research language differs.

Research cutoff: **7 October 2026**. This dossier covers decoding and model-call reduction for a pluggable GGUF assistant on 8–16 GB consumer laptops, with coding as the primary demanding workload. It supports the [architecture and roadmap](architecture.md). The strongest direction is to reduce the amount of inference required, then accelerate the remaining inference. Runtime support, suitability for a particular model, and an actual laptop speedup are separate findings.

The first experiments should be semantic edits, fill in the middle, and compact patches selected by demonstrated model capability; draftless source and prompt lookup for rewriting existing code; and one target-specific drafter only when measured verification economics justify it. One resident generator is an initial scheduling policy, not a prohibition on additional neural components. A small drafter or encoder is admissible when its full memory, loading, prefill, execution, and maintenance costs earn a measured task-level gain.

Current upstream llama.cpp includes EAGLE-3, DFlash, DSpark, and MTP paths. The detailed conditions below matter more than the algorithm name. Pin a tested runtime commit and record the build information from `/props`; mutable upstream documentation and code already disagree on some flags. Proposed experiments are not measured results for the target laptop.

## 1 Measure the actual quantity we want to minimize

Use the following accounting for one completed task. P is prefill, D is generation, S is sampling and grammar work, and H is host/runtime overhead.

```text
T_task = T_queue + T_load + sum_j(P_j + D_j + S_j + H_j)
         + T_tools + T_verify + T_repair
```

Token throughput omits model loading, repeated prompts, test execution, rejected patches, and retries. The promotion metric is **wall time to a correct verified result**, with completion rate and human intervention measured separately. A decoder speedup s applies only to the fraction f of baseline time it accelerates:

```text
S_task ≈ 1 / ((1 − f) + f / s)
```

If decoding consumes half the task, doubling decoding speed yields approximately 1.33 times task speed before additional overhead. Record cold and warm latency, first useful result, verified completion, p50 and p95, input/output/thinking tokens, model turns, acceptance by draft position, draft/verify/rollback time, peak system memory, paging, and energy per completed task. Separate short interactive edits from long generations.

**Experiment and gate:** collect baseline traces before optimizing. Eliminate mechanisms aimed at components contributing little to measured task time. Predeclare a mechanism-specific minimum useful gain and quality tolerance proportional to integration burden; an inexpensive toggle may earn a smaller gain than a maintained runtime fork.

## 2 Exact speculative decoding

A draft distribution q proposes tokens. The target distribution p scores their prefixes together. For sampled draft token x, classical speculative sampling accepts with probability a(x). After rejection, draw from the residual distribution r. If every proposed token is accepted, sample one additional target token.

```text
a(x) = min(1, p(x) / q(x))
r(x) = max(0, p(x) − q(x)) / sum_y max(0, p(y) − q(y))
α = sum_x min(p(x), q(x)) = 1 − TV(p, q)
```

Under the algorithm's assumptions, this preserves the target distribution. Target means the actual deployed model and sampling policy, including its quantization, not an unquantized reference model. α is the single-position acceptance probability.

For maximum draft length K, the expected emitted length is the sum of prefix survival probabilities plus the target token. A constant independent conditional acceptance α is a simplifying approximation, not a property to assume of real workloads.

```text
E[L] = 1 + sum_(i=1..K) Pr(first i draft tokens accepted)
Constant-α approximation: E[L] = 1 + α + α² + ... + α^K

S_decode ≈ E[L] × T_1 /
  (T_draft(K) + T_verify(K+1) + T_rollback + T_sampling + T_sync)
```

Acceptance percentage alone is insufficient. A slow drafter or inefficient verification batch can erase the gain. Primary foundations: [Leviathan et al., ICML 2023](https://proceedings.mlr.press/v202/leviathan23a.html) and [Chen et al., February 2023](https://arxiv.org/abs/2302.01318).

### Current llama.cpp verification behavior

The inspected server supports target-sample-and-match, which retains a proposed token when it equals the target's independently selected token, and full rejection sampling using the draft distribution. Current draft sampling defaults to greedy. `--spec-draft-sampling probabilistic` is available; the inspected simple and MTP implementations supply distributions for rejection sampling. The EAGLE-3, DFlash, and DSpark paths inspected do not populate that distribution vector, so server verification falls back to target-sample-and-match. At target temperature zero, the distinction disappears.

Sources: [argument definitions](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/common/arg.cpp), [defaults](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/common/common.h), [sampling implementation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/common/sampling.cpp), and [server selection](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/server-context.cpp).

Distribution preservation does not mean identical outputs for the same random seed. Floating-point differences between batch shapes and backends can alter greedy decisions near ties.

**Experiment:** first measure target verification cost at several small batch sizes for the exact model, quantization, backend, and context lengths. Then sweep draft length and record complete cycle cost. If verification cost is approximately K times ordinary one-token decoding cost, a separate neural drafter has little room to help.

## 3 Draftless prompt lookup and source as draft

For an edit, the original file already contains likely future output. Propose tokens from matching source segments and let the target verify them. Unchanged regions can become batch verification work. This is the first speculation family to test under scarce memory.

| Mode | Mechanism | Appropriate first use |
| --- | --- | --- |
| `ngram-simple` | Match recent tokens against history and propose the following continuation | Small repeated code edits |
| `ngram-map-k` | Indexed continuation lookup with occurrence and acceptance information | Repeated passages |
| `ngram-map-k4v` | Track multiple continuations per key | Experimental ambiguous repetitions |
| `ngram-mod` | Fixed-size rolling-hash next-token pool | Low-memory general draftless trial |
| `ngram-cache` | Statistics from context and optional external caches | Repeated repository patterns |

`--spec-default` currently selects ngram-mod, not an automatic choice among all algorithms. Its documented pool is approximately 16 MB. Default match/minimum/maximum lengths are 24/48/64; these should not be presumed optimal for a small dense target. Sources: [speculation documentation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/docs/speculative.md), [ngram-mod](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/common/ngram-mod.cpp), [map implementation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/common/ngram-map.cpp), and [external-cache implementation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/common/ngram-cache.cpp).

No second weight set or neural draft pass is required. Benefits should concentrate in copy-heavy tasks. Lookup and rejected verification still cost time; new algorithms, extensive rewrites, or creative prose may offer little reuse. Increasing the prompt just to seed lookup can cost more prefill than it saves.

**Experiment:** compare ordinary decoding, ngram-simple, and ngram-mod over edits grouped by low, medium, and high unchanged fraction. Include whitespace changes, renamed identifiers, repeated boilerplate, deletions, and new functions. Measure full verified-edit time, not rewritten-token throughput.

**Promotion gate:** enable only for workload classes that meet predeclared latency, quality, tail-latency, and memory limits. Set the minimum useful gain according to integration and maintenance cost. A simple supported toggle can justify a smaller improvement than custom source-alignment code; there is no universal percentage threshold.

### Specialized edit speculation

[Cursor's May 2024 technical report](https://cursor.com/blog/instant-apply) demonstrates deterministic edit drafts, but its headline used a specialized 70B deployment. It supports the mechanism, not a laptop forecast.

[EfficientEdit, June 2025](https://arxiv.org/html/2506.02780v1) alternates source reuse and new-token generation, then finds where to resume reuse. Its generation phase deliberately relaxes acceptance under some conditions, so the entire method is not an exact-output-preserving acceleration. Its five-RTX-4090 results should not be transferred to this system.

[Blazedit, February 2025](https://huggingface.co/blog/ganler/blazedit) uses prompt lookup to accelerate a neural drafter before target verification. This differs from llama.cpp's documented priority scheme, where a draftless candidate can take precedence over a neural one.

**Later experiment:** a repository-aware source draft that tracks source positions and resumes copying after a changed span. Start with existing ngram support and add custom runtime work only if profiling reveals substantial missed reuse.

## 4 A separate small draft model

Confirmed mode: `draft-simple`, supplied through `-md` or `--spec-draft-model`. An ordinary smaller model proposes several tokens autoregressively. Both models must fit comfortably with their state, buffers, and the rest of the application.

Current simple-draft code checks vocabulary properties and token-ID meanings. Pairing two GGUFs simply because both understand code is invalid. The draft receives the target's token stream; familiarity with that format affects acceptance. [Universal Assisted Generation](https://huggingface.co/blog/universal_assisted_generation) demonstrates tokenizer translation in Transformers, but adds alignment work and does not establish arbitrary-pair support in llama.cpp.

On CPU, drafting rereads another weight set and competes for the same memory bandwidth. A 0.5B drafter can be too expensive relative to an already fast 1.5B target. GPU verification may amortize target weight traffic, but small-batch kernels, transfers, synchronization, and sampling determine the benefit.

**Experiment:** after establishing a favorable verification-cost curve, test compatible pairs at K = 1, 2, 4, and 8, plus greedy versus probabilistic drafting for stochastic target tasks. Include drafter prefill and reloads.

**Kill criteria:** paging, persistent p95 regression, poor acceptance on intended work, or drafter cost approaching the target passes it removes. Do not retain an extra model merely because an isolated throughput benchmark improves.

## 5 Target specific drafters

EAGLE-3, DFlash, and DSpark exploit target internals and can offer better economics than a generic draft model. They require suitable trained components and runtime support for the exact pairing.

### EAGLE-3

[EAGLE-3, March 2025 and NeurIPS 2025](https://arxiv.org/abs/2503.01840) trains a compact drafter using target features. Current llama.cpp has `draft-eagle3`. Documented small pairings include [Qwen3-1.7B EAGLE3](https://huggingface.co/AngelSlim/Qwen3-1.7B_eagle3) and Qwen3-4B EAGLE3. Conversion uses `--target-model-dir` for the target tokenizer and extraction metadata.

**Experiment:** compare an exact supported pairing against target-only and draftless lookup at the deployed target quantization. Sweep short draft lengths. Do not assume a drafter trained for a base model retains useful acceptance after target fine-tuning. Promote only when feature extraction and state management still leave a worthwhile task-level gain and enough memory for the desktop workload.

### DFlash

[DFlash, February 2026 and ICML 2026](https://arxiv.org/abs/2602.06036) drafts a block in parallel using a small diffusion model conditioned on target features. It reduces the serial cost of autoregressive drafting. Current mode is `draft-dflash`; the documented Qwen3-4B example uses `--spec-draft-n-max 15 -fa on`. The trained block size constrains usable length. [Runtime graph implementation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/models/dflash.cpp).

One draft pass per block may suit GPU execution. On a weak CPU or inefficient verification kernel, extra block computation can cost more than the target steps saved. Features and draft state also consume memory.

**Experiment:** measure draft block cost and target verification separately, then compare the complete loop on copied code, new code, and short tool calls. Paper headline speedups do not establish results for this hardware.

### DSpark

[DSpark, July 2026](https://arxiv.org/abs/2607.05147) adds a lightweight sequential dependency mechanism to parallel drafting and uses confidence to select verification work. Its production results concern a large serving system. Current llama.cpp mode is `draft-dspark`; a small published pairing is [Qwen3-4B block-7](https://huggingface.co/deepseek-ai/dspark_qwen3_4b_block7).

**Documentation and code conflict:** speculative.md advertises `--spec-draft-conf-min`, but the inspected argument parser does not contain that flag. The implementation uses `--spec-draft-p-min` for DSpark confidence truncation. Probe the installed binary. Acceptance confidence predicts agreement with the target; it does not measure whether a program solves the task.

### LiquidAI DSpark

[LiquidAI's August 2026 report](https://www.liquid.ai/blog/lfm2.5-dspark) releases approximately 300M-parameter drafters, including a 327.7M drafter for LFM2.5-2.6B. The reported design shares target embeddings and the output head. LFM2 support and recurrent-state partial rollback [merged upstream in PR 27383](https://github.com/ggml-org/llama.cpp/pull/27383) on 20 August, so documentation restricting DSpark to Qwen3 is stale.

The reported M4 Max results use FP16 GGUF, block size 9, greedy decoding, and experimental Metal kernels. The mean 2.27 times result for the 2.6B model is not an 8–16 GB quantized-laptop result. [Kernel PR 27441](https://github.com/ggml-org/llama.cpp/pull/27441) remained Draft when inspected. Its M4 Max 36 GB measurements report stock-versus-patched speculation of 1.84 times versus 2.27 times, and note occasional greedy differences from changed floating-point summation order.

**Disposition:** retain this as an optional model/backend experiment. Decoder speed does not qualify the target as the coding default; task capability remains a separate gate.

## 6 MTP and self speculation

### MTP

Current llama.cpp supports `draft-mtp`. Supported models can carry trained next-token prediction heads; a draft context can use the same model object instead of an independent full draft model. Extra state and buffers still cost memory. A conversion that omitted the heads cannot gain them through a flag.

The [Qwen3.5 implementation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/src/models/qwen35.cpp) accommodates MTP layers separately from recurrent trunk layers. Inspect the actual GGUF artifact rather than inferring support from the family name.

**Experiment and gate:** for an otherwise qualified coding model containing supported MTP tensors, compare no MTP with short draft lengths. Measure recurrent rollback/replay cost and peak memory. Reject configurations where rollback removes the benefit or the working set approaches paging.

### LayerSkip and Draft and Verify

[LayerSkip, April 2024](https://arxiv.org/abs/2404.16710) combines early-exit training, self-speculation, and cache reuse. [Draft and Verify, September 2023 and ACL 2024](https://arxiv.org/abs/2309.08168) skips selected layers for drafting and verifies with the full model. Weight reuse is attractive, but no corresponding supported llama-server mode was verified in the inspected upstream list. A downloadable LayerSkip GGUF does not establish accelerated execution support.

Defer custom integration unless a qualified model and maintained runtime path offer a compelling measured advantage. Skipping layers without full verification changes model quality.

### Medusa and tree or Jacobi methods

[Medusa, January 2024](https://arxiv.org/abs/2401.10774) uses additional trained prediction heads and tree verification. Native llama-server Medusa support was not verified. Candidate trees and Jacobi/lookahead approaches can spend substantial compute and state on discarded candidates; they must obey the same cycle-cost and memory accounting.

**Disposition:** keep custom Medusa/tree/Jacobi work outside the initial critical path. Revisit only against a demonstrated bottleneck and a maintained implementation, after supported alternatives have been measured.

## 7 Adapt speculation to measured cost

Fixed draft length is rarely optimal across source copying, new code, reasoning, and prose. A proposed controller would choose off, draftless, or one configured neural drafter using recent emitted tokens per verification, draft and verification wall time, context length, remaining output allowance, workload class, and memory pressure.

```text
K_best = argmin_K T_cycle(K) / E[L(K)]
```

Longer accepted runs are valuable only if their extra cost is justified. Start with offline per-workload presets. A later online controller should use minimum observation windows and hysteresis to avoid oscillation. Short tool calls and source-copy runs can use different policies under the same resident model.

**Experiment and gate:** compare the policy against the best simple fixed baseline on held-out tasks, including policy-selection overhead. llama.cpp prioritizes draftless proposals when combined with a neural drafter; separately measured gains are not multiplicative.

## 8 Avoid generating unchanged code

Speculation accelerates generated tokens; selecting a better operation can remove those tokens entirely.

| Representation | Best fit | Main failure mode |
| --- | --- | --- |
| Native LSP rename or code action | Supported semantic refactors | Incorrect scope or version assumptions |
| Structural transformation | Repeated AST patterns | Structure does not prove behavior |
| Fill in the middle | Bounded missing or replacement span | Model lacks effective FIM training |
| Anchored search and replace | Local changes | Ambiguous or stale anchors |
| Whole-file rewrite and source draft | Extensive edits or poor patch competence | Unrelated changes and large output |

[FIM training research, July 2022](https://arxiv.org/abs/2207.14255) supports generating a missing span from prefix and suffix. llama-server provides `/infill` with `input_prefix`, `input_suffix`, and optional extra context. Effective FIM is a model capability requirement, not a guarantee furnished by an endpoint.

Use [LSP rename](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/rename.md), [code actions](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/language/codeAction.md), and structural tools such as [ast-grep](https://ast-grep.github.io/guide/introduction) where applicable. The model identifies a symbol or transformation and supplies novel information; deterministic software constructs the edit. Check source versions and preconditions before applying it.

**Experiment and gate:** evaluate the same real changes under all applicable representations with identical correctness checks, including failures and repairs. Select by verified latency and success per operation family. Fewer emitted tokens do not help if the model repeatedly produces unusable patches.

## 9 Grammar constraints and semantic checks

A grammar can ensure an action has the required structure. It cannot establish that a filename exists, a symbol is correct, a tool call is authorized, or a patch fixes the bug. [GBNF documentation](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/grammars/README.md) describes partial JSON Schema support and silently skipped unsupported features. Repeated optional patterns can create severe sampling overhead; bounded repetition is preferable.

An optional [llguidance build](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/docs/llguidance.md), enabled with `-DLLAMA_LLGUIDANCE=ON`, provides broader schema coverage and a different parser. Published mask timings are not laptop end-to-end timings. Current common sampling code disables backend sampling when grammar or reasoning-budget samplers are active, so a raw-text backend benchmark cannot predict structured-tool performance.

Constrain small action schemas and retrieve a small relevant tool set. Generate operation IDs, arguments, and artifact references; software supplies metadata. Describe schema meaning in the prompt where necessary, validate the complete result independently, and apply path/symbol/state preconditions after syntax validation. Reuse compiled schemas where supported and avoid huge per-request enumerations.

**Break-even and experiment:** schema construction and per-token cost must be smaller than the malformed-output and repair work they prevent. Compare unconstrained output, GBNF, and llguidance on actual schemas, recording semantic tool success separately from JSON validity. Include Unicode, escaping, optional fields, and larger schemas.

### Semantic constraints during generation

[Monitor-Guided Decoding, NeurIPS 2023](https://arxiv.org/abs/2306.10763) uses static analysis for repository-aware generation. [Synchromesh, 2022](https://arxiv.org/abs/2201.11227) combines syntax and contextual constraints for structured programs. Exposing compiler/LSP facts and repair diagnostics is the first practical step.

The [MGD reference implementation](https://github.com/microsoft/monitors4codegen) uses a Transformers logits processor. Full token-level semantic masking therefore requires integration work for this stack. Defer it until identifier or type errors demonstrably dominate failures.

## 10 Thinking budgets and stopping

Long reasoning is expensive on a low-throughput local model, but arbitrary truncation can produce a fast failure. Current controls include `--reasoning`, `--reasoning-effort`, and `--reasoning-budget`. Request parsing recognizes `reasoning_budget_tokens` and `thinking_budget_tokens` when the template provides suitable thinking delimiters. Sources: [request conversion](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/server-common.cpp) and [budget sampler](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/common/reasoning-budget.cpp).

The sampler can rearm for multiple thinking blocks. Combine per-block thinking limits with total generation and task limits. Hiding reasoning text does not avoid generating it. Token confidence does not establish task correctness. Ending a thinking block does not establish a valid final answer. Maximum output length does not by itself define a reliable total-time limit.

[Making Small Language Models Efficient Reasoners, May 2025](https://arxiv.org/abs/2505.07961) demonstrates redundant reasoning and efficiency techniques on mathematics. It supports investigation, not a guarantee of coding quality under arbitrary budget cuts.

**Proposed policy:** bounded action selection for familiar operations, with more reasoning when external checks reveal an unresolved issue. Stop at a complete actionable object or supported end marker. Treat incomplete code or JSON as incomplete.

**Experiment and gate:** evaluate native nonthinking mode, short budget, medium budget, and unrestricted reasoning by task family. Include repair time. Promote a shorter budget only within a predeclared quality tolerance.

## 11 Exact prefix caching and checkpoints

KV reuse removes repeated prefill. It does not avoid generating the next output or make stale facts correct. The [server API](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/README.md) supports `cache_prompt`, slot control, and prompt evaluation with `n_predict: 0`. Reuse depends on token prefixes. Current defaults include an 8192 MiB RAM-cache limit; an 8 GB product must set its own budget.

Build prompts with a stable system/tool prefix, stable repository or task context where useful, and changing request/evidence suffix. Key reusable state by model, tokenizer, template, adapters, and runtime identity. Track cached tool-result validity and source versions separately.

A changed timestamp or reordered tool list near the start can destroy the common prefix. Template changes may remove historical thinking or alter delimiters between turns. Compare rendered token streams, not just message objects. Edited source must invalidate stale evidence even when other prefix state remains reusable.

Hybrid/recurrent and sliding-window models complicate rewind. The inspected server uses checkpoints and can reprocess the prompt when required state is missing. Measure actual reused tokens and replay time.

```text
Saved prefill time must exceed:
lookup + restore + checkpoint work + memory-pressure cost
```

**Experiment and gate:** repeat real edit/tool cycles, vary an early prefix component, modify source, switch template/model, and resume after eviction. Test cold and warm behavior separately. Require correctness first; retain caches only when their amortized benefit is positive and memory remains bounded.

## 12 Remove model calls with bounded workflows

The largest local improvement may come from removing repeated orchestration turns. [LLMCompiler](https://proceedings.mlr.press/v235/kim24y.html) motivates dependency-aware execution; for this system, compile the next bounded phase rather than a long speculative plan for an unknown task.

**Proposed operations:** retrieve a symbol, its references and relevant diagnostics together; apply a supported refactor and return its diff plus checks; search and aggregate data in native software; overlap independent reads while preserving write dependencies. An operation should return compact evidence and artifact references instead of flooding the next prompt.

[Agent Workflow Memory](https://arxiv.org/abs/2409.07429) studies reusable routines, while [Are Online Skill and Memory Modules Always Worth Their Tokens?](https://arxiv.org/abs/2606.15017) shows why budget-matched ordinary agents are necessary controls. Skill creation, selection, injection and maintenance all spend work.

**Experiment:** convert a successful trace into a parameterized operation with applicability checks, tool/source versions, preconditions and outcome checks. Evaluate unseen parameters, changed repository state and unrelated near-matches. Compare against a simple controller with the same total budget.

An approximate amortization condition is:

```text
expected uses × (ordinary task cost − guarded routine cost)
    > creation + validation + maintenance cost
```

**Kill criteria:** routine discovery consumes the savings; success depends on repeating benchmark templates; state changes yield incorrect actions; or selection repeatedly chooses an inapplicable recipe. Make learning selective and scheduled, not an always-running reflection swarm.

## 13 Evidence that prevents overclaiming

The [Lossless but Not Free preprint](https://arxiv.org/html/2607.17283v1) examines selected speculative configurations on one 18 GB M3-class laptop. It reports both wins and slowdowns, including costly drafts and nearly linear small-batch verification in some cases. Its small prompt sets, custom orchestration and specific software limit generalization: it identifies assumptions to test, not a verdict against current native speculation.

Distinguish six claims: GPU-paper throughput versus laptop behavior; model-card throughput versus verified coding; nonsignificant quality differences versus demonstrated equivalence; compilation versus behavioral correctness; distribution preservation versus identical seeded output; and synthetic acceptance versus valid generation.

Current synthetic acceptance controls deliberately bypass real verification. They can characterize a hypothetical hardware ceiling but must never supply the headline task result. The [upstream SPEED-Bench client](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/tools/server/bench/speed-bench/README.md) helps measure throughput and acceptance categories; pair it with functional tasks and real acceptance checks.

**Experiment record:** model/draft hashes, runtime build, templates, backend, precision, context depth, verification length, sampler, acceptance by position, actual emitted progress, draft/verify/rollback cost, output validity, task outcome, cold/warm state and memory. Verify that synthetic acceptance options are disabled in all quality and product-latency runs.

## 14 Multiple candidates and self-consistency under a fixed budget

**Proposed mechanism:** for hard tasks, generate more than one candidate and use external checks to select or refine the result. This can improve the probability of finding a correct solution, but it increases generation and verification. It is not automatically a speed optimization.

Candidate errors are correlated. Two similar prompts to the same model are not two independent experts, and majority agreement can select a shared mistake. A model reviewing its own patch can provide useful criticism without being an independent correctness oracle.

**Initial policy:** on the smallest laptop, generate candidates sequentially, stop when a candidate satisfies the trusted checks and task requirements, and preserve one resident target. Use diverse justified strategies rather than repeatedly sampling almost identical text. Never let a candidate weaken the tests that select it.

**Experiment:** compare one larger reasoning budget, several shorter candidates, one attempt plus evidence-guided repair, and a stronger fitting model. Match total elapsed or token/energy budgets, include verification cost, and report unresolved tasks. Separate bounded tasks with strong oracles from open-ended tasks where selection is uncertain.

**Promotion gate:** the candidate policy must improve accepted outcomes within the same budget or reduce expected time to an accepted outcome. Stop adding candidates when marginal success gains no longer repay their cost. A candidate generator may be useful only for a difficult task class.

A one-resident-generator policy is a starting resource policy. A small drafter, encoder or controller may coexist when its measured whole-task gain and total working set justify it. Count all states, workspaces, loading and interference; model count alone is not a physical resource budget.

## 15 Implementation sequence and mechanism-specific gates

**Stage A:** remove unnecessary inference through compact tools, bounded evidence, exact supported reuse, semantic edits and an edit-format comparison.

**Stage B:** measure the target verification-cost curve and test draftless lookup by unchanged-code fraction and task class.

**Stage C:** test one exact supported EAGLE3, DFlash, DSpark or MTP pairing. Include draft prefill, target features, rollback, cache replay and real desktop memory.

**Stage D:** compare simple fixed settings with offline workload presets, then test a small cost-aware controller. Evaluate combinations as configurations rather than multiplying isolated multipliers.

**Frontier track:** custom source-resumption drafts, semantic token masks, specialized distillation or new kernels may be prototyped in parallel once a reproducible measurement harness exists. Lack of upstream integration raises the experiment cost; it is not an automatic reason never to try the mechanism.

Every promotion requires a predeclared useful gain proportional to integration complexity, adequate held-out quality evidence, acceptable tails and retries, bounded memory under a realistic desktop workload, and stable sustained behavior. A small safe option can justify a modest improvement; a maintained runtime fork requires a substantially stronger case. No universal percentage establishes either conclusion.

## 16 Smallest decisive experiment for each decoding family

| Family | First experiment | Evidence needed before deeper integration |
| --- | --- | --- |
| Source/ngram proposals | Existing edits with low, medium and high unchanged fraction | Full edit time improves after lookup, prefill and rejection costs |
| Generic draft model | Exact compatible pair, short draft lengths | Accepted progress exceeds draft plus verification and state costs |
| EAGLE/DFlash/DSpark | One released target-specific pair on one exact backend | Feature extraction, block verification and rollback fit the budget |
| MTP/self-speculation | Artifact with actual supported prediction heads | Extra state and replay do not erase the saved target work |
| FIM/patch/native edit | Same real changes through applicable representations | Fewer unusable patches or lower complete-task latency |
| Grammar/parser | Actual small tool schemas, including invalid cases | Semantic action success improves after mask construction/sampling cost |
| Reasoning budget | Model-native modes and several bounded budgets | Saved thinking does not reappear as more repairs or wrong actions |
| Candidate selection | Equal total-budget comparison on checkable tasks | Increased verified success, with correlated failures accounted for |
| Adaptive controller | Held-out workload mix versus the best simple preset | Selection overhead and oscillation do not erase the gain |

This dossier describes inspected implementations, published experiments and explicitly marked proposals. It does not report a benchmark on the user's laptop.
