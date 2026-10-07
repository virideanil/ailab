# Context retrieval and reusable work for local AI

> Research snapshot: 7 October 2026. [Original Page](https://chatgpt.com/space/page_fe9604e499088191afa09e6b90f49212). This document records evidence, hypotheses, and proposed experiments. Implemented scope is described in the [repository README](../../README.md); proposals are not measured product capabilities. The [evaluation contract](evaluation-contract.md) governs qualification where older research language differs.

Use a small resident GGUF model with a context manager that retrieves current evidence, reuses only valid work, and keeps the model's expensive serial loop short. For an 8–16 GB laptop, the first implementation should combine exact prefix reuse, bounded runtime state, incremental symbol and lexical indexes, content-addressed tool results, and selective task memory. Dense retrieval, learned compression, and specialized attention eviction are conditional experiments.

This reference supports the [local AI architecture and build roadmap](architecture.md). The runtime capability snapshot is 7 October 2026. Implementation choices and numerical adoption thresholds below are proposed engineering policies. Published measurements retain their original workload and hardware scope; none is a measured speedup for the target laptop.

## 1 Cost and quality model

Optimize elapsed time to an accepted result. A request that decodes quickly but needs extra retrieval turns, repairs, or user correction can be slower overall.

**Task time = queue + load + retrieval + state restore + prompt processing + generation + tools + verification + repairs.**

For repeated work, use:

**Net saving = avoided computation − lookup − validation − serialization − restoration − additional memory pressure cost.**

For an optimization evaluated over N future uses:

**Total benefit = Σ per-use net saving − preparation − maintenance.**

Preparation includes indexing, embedding, skill extraction, kernel compilation, and model loading. Maintenance includes invalidation and rebuilds. Battery impact and interactive responsiveness need separate measurement; lower wall time does not guarantee lower energy.

A useful approximation for prompt work is P(U,C), the measured time to process U new tokens while attending to C cached tokens. Do not replace it with a constant tokens-per-second figure across every context length. Let D(O,C) be time for O generated tokens at effective context C. Retrieval wins when its additional cost is smaller than the reduction in P, D, and expected repairs.

For example, if measurements show that avoiding 2,000 uncached tokens saves 8 seconds, a 100 ms deterministic search can be attractive. If the same tokens already have a valid hot prefix cache and eliminating them saves only 50 ms of later attention work, a 500 ms reranker is a loss. These numbers illustrate the arithmetic; they are not laptop benchmarks.

Use a hard memory envelope:

**Resident model + active inference state + compute workspace + indexes + cached snapshots + editor and OS reserve ≤ usable memory.**

Start with one generation slot. A second conversation state can occupy substantial memory even when model weights are shared. Shrink or evict recoverable caches before allowing paging to displace the active model.

## 2 Exact prefix reuse

**Decision: Adopt, with token-level identity and runtime capability checks.**

In causal attention, representations for an already processed token do not depend on future tokens, enabling reuse of prior key and value tensors. Future queries still attend to retained past states, so caching removes recomputation of the prefix rather than making long history computationally free. [Transformers cache explanation](https://huggingface.co/docs/transformers/cache_explanation).

Current llama-server documents cache_prompt, explicit slot assignment, RAM prompt caching, context checkpoints, and slot save/restore. It warns that cached and uncached paths may produce different logits because batching changes floating-point behavior. The inspected README lists an 8,192 MiB default RAM-cache limit; this is a cap, not evidence that all memory is allocated immediately. Configure it explicitly for the laptop. [llama-server reference](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md).

**Proposed identity:** model-file digest, adapters and scales, tokenizer digest, chat-template digest, positional and attention configuration, runtime state-format version, relevant backend configuration, KV formats, and the exact token prefix with positions and modality inputs. Hash the rendered and tokenized prompt, not only the message JSON.

Use the longest identical prefix under the same compatible configuration. An edited early instruction invalidates its dependent suffix even when later text happens to be unchanged. Identical words after different earlier context do not establish identical hidden states. A conservative implementation starts with prefix reuse only; shifted-chunk reuse belongs to a separate quality experiment.

Keep sampling parameters distinct from forward-state identity: changing temperature does not itself alter the already encoded prefix. Replaying a generated answer or reproducing an entire sampling run additionally depends on sampler state, seed, constraints, and generation settings.

**Break-even:** retain a prefix if expected future prompt work avoided exceeds lookup, copy/restore, and memory-pressure costs. Disk persistence additionally pays bytes written and read, synchronization, and metadata checks. Keep a small number of high-value prefixes, not a snapshot of every turn.

**Experiment:** alternate identical, appended, early-edited, template-changed, adapter-changed, and restarted prompts. Compare cache counters, actual prompt work, latency, and task correctness. Require stale configurations to miss cleanly. Do not require bit-identical prose as the only correctness test.

## 3 Recurrent and hybrid state checkpoints

**Decision: Adopt supported continuation and checkpoint recovery; do not assume transformer-style arbitrary rewind.**

Current llama.cpp recurrent-memory code explains why states such as Mamba or RWKV cannot generally erase a suffix: earlier states are not retained for every token. The inspected implementation also has bounded rollback using per-token snapshots, limited by n_rs_seq and sharing conditions. Therefore both “recurrent models cannot cache” and “recurrent models can rewind anywhere” are inaccurate. [Recurrent memory implementation](https://github.com/ggml-org/llama.cpp/blob/master/src/llama-memory-recurrent.cpp).

Hybrid memory combines attention and recurrent stores. Its sequence-removal path attempts recurrent removal first and only modifies attention state after that succeeds. A usable snapshot must preserve the combination. [Hybrid memory implementation](https://github.com/ggml-org/llama.cpp/blob/master/src/llama-memory-hybrid.cpp).

The server's checkpoint path records partial states and can restore a suitable earlier checkpoint before replaying the remaining prompt. Its code contains special handling for sliding-window coverage, batch boundaries, and multimodal data; treat this as model-and-build behavior, not a universal storage contract. [Server context implementation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-context.cpp).

**Proposed policy:** expose capabilities such as append, rewind range, state export/import, attention shifting, and checkpoint size from the runtime adapter. For a changed prefix, restore the nearest valid checkpoint before the changed token and replay everything after it. If none exists, reprocess the prompt. Never splice recurrent state inferred from a text substring.

Let checkpoint spacing be J tokens and measured checkpoint cost be S milliseconds. Regular spacing introduces roughly S/J overhead per processed token; a uniformly located edit adds roughly J/2 unchanged replay tokens before the edit, plus processing of the changed suffix, provided an eligible checkpoint exists. Real edits are not uniform: favor stable system/task prefixes and useful branch points.

**Experiment:** change an early instruction, fork at a tool result, cancel mid-prefill, restore after restart, and request a rewind beyond the supported range. Compare fresh replay with checkpoint continuation on instruction recall and verified task outcomes. Include RAM peaks from every checkpoint. Choose spacing from measured reuse, not the server default alone.

## 4 Content addressed tool results

**Decision: Adopt for deterministic reads and computations.**

Bazel separates an action cache, mapping action identities to result metadata, from a content-addressed store containing output bytes. Its actions declare inputs, commands, environment, and expected outputs. This is a useful engineering precedent for reusable tool work. [Bazel remote caching](https://bazel.build/remote/caching). Its hermeticity guidance also identifies clocks, system binaries, undeclared environment, and source-tree mutation as sources of non-reproducibility. [Bazel hermeticity](https://bazel.build/basics/hermeticity).

**Proposed action key:** hash of tool implementation/version, canonical arguments, workspace identity, working directory, relevant configuration, declared dependency digests, and execution environment. Store the actual result bytes under their own digest. Record status, provenance, creation time, and dependency manifest separately.

A cached file excerpt depends on file bytes, encoding, range-selection semantics, and tool version. A compiler diagnostic additionally depends on imports, compiler flags, generated files, project configuration, and toolchain. A search result depends on the searchable corpus generation: adding a new matching file invalidates a previous “no matches” result even though every formerly returned file is unchanged.

Treat unknown dependencies conservatively. A general shell command does not become cacheable because it succeeded once. Prefer the build system's existing incremental/cache mechanism for builds and tests. Never replay a mutation by returning its previous success message; a reusable procedure must execute its current guarded actions.

**Freshness:** immutable objects can be reused by digest indefinitely while retained. Mutable network resources require an appropriate version, validator, or expiry policy. A timestamp-based TTL bounds allowed age; it does not prove unchanged contents. Access scope belongs in lookup and retrieval authorization so results cannot leak across workspaces.

**Break-even:** read/validate cost must be below the underlying tool cost. Caching a tiny local read can be slower than rereading it; caching a parse, dependency scan, or expensive report can repay quickly.

**Experiment:** modify an import, change a lockfile, switch branches, add a file to a previously empty search, preserve a file's mtime while changing bytes, and alter a relevant environment setting. Every affected action must miss or revalidate. Unaffected pure actions should retain hits.

## 5 Incremental repository and symbol maps

**Decision: Adopt a compact index; construct the prompt view on demand.**

Aider demonstrates a repository map containing significant definitions and signatures. Its implementation ranks definition/reference relationships, caches extracted tags, and selects material to fit a token budget. The inspected cache uses file mtimes, illustrating a practical implementation but not a sufficient identity rule for every workload. [Aider repository map](https://aider.chat/docs/repomap.html), [Aider source](https://github.com/Aider-AI/aider/blob/main/aider/repomap.py).

**Proposed index record:** workspace, normalized path, file digest, language, parser/query version, symbol identity, kind, byte range, signature, containing scope, and origin. Keep syntax-derived references distinct from compiler-resolved references. Same spelling does not prove the same symbol.

Watch file changes, debounce bursts, compare content hashes, and update only affected files and relationship records. An atomic index generation gives each search a coherent snapshot. Store compact extracted facts in SQLite; retain full syntax trees only for hot files if memory allows. A symbol index and a full language-server workspace index have different memory costs.

Avoid injecting the entire map every turn. Start with paths and exact identifiers from the request, active files, diagnostics, and recent changes. Retrieve candidate definitions, then fetch the bodies and tests needed for the operation. Add bounded neighboring callers/imports when they matter. A graph score can prioritize candidates; it must not exclude the only low-centrality implementation.

**Invalidation:** content edits invalidate extraction. Parser or query upgrades invalidate affected language records. Import resolution also depends on paths, project config, dependency versions, and generated sources. Branch changes trigger reconciliation of additions, deletions, and moves. Unsaved editor buffers form an overlay with their own versions.

**Break-even:** maintain the index when repeated navigation savings exceed update cost. For a tiny or one-off repository, direct file search is a valid baseline. Pause broad indexing while interactive inference or user typing is latency-sensitive.

**Experiment:** compare direct search, lexical index, symbol map, and combined retrieval on known-symbol edits and unfamiliar cross-file bugs. Record cold index time, incremental update time, peak memory, relevant-symbol recall, tool turns, and accepted-change latency.

## 6 Tree sitter and language server freshness

**Decision: Use syntax incrementality and semantic editor operations at their supported strengths.**

Tree-sitter can edit an existing tree and parse against it, sharing structure with the prior tree. Stored node positions outside the tree also require updating after edits. [Tree-sitter incremental parsing](https://tree-sitter.github.io/tree-sitter/using-parsers/3-advanced-parsing.html).

The Language Server Protocol requires the client to synchronize document changes before requests such as completion or signature help; versioned notifications identify the document state being described. [LSP document change specification](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.17/textDocument/didChange.md).

**Proposed operation contract:** each retrieval or edit carries document URI, document version, content digest, and workspace/configuration generation. For an edit, revalidate the precondition immediately before applying it. Reject a stale edit and recompute; do not silently relocate by line number.

Tree-sitter supplies syntactic scope and ranges, including for incomplete code. It does not replace type resolution. Use a language server for references, rename, diagnostics, and definitions where supported; use parser/text fallbacks when unavailable. Record which path produced the result so the confidence of a “reference” is explicit.

Cross-file semantics can become stale after dependency/configuration edits even when the target file is unchanged. Track the project generation. Respect server startup, indexing completion, and cancellation. A late response to version 7 must not overwrite a version 8 result.

**Break-even:** an already running editor language server may save repeated model reasoning; starting a large workspace server for a tiny read can lose. Share an existing connection where its protocol and ownership permit, or start lazily and bound its resource use.

**Experiment:** request rename while the user types, change an imported type, edit an unsaved buffer, move a file, and restart the language server. Require correct target identity and no stale overwrite. Include the server's startup and indexing time in cold measurements.

## 7 Lexical retrieval and FTS5

**Decision: Use as the default persistent retrieval layer.**

SQLite FTS5 offers BM25 ranking, column weights, prefix/phrase facilities, and a rank column optimized for ordered retrieval. Better BM25 matches have numerically smaller scores in FTS5. External-content indexes require explicit consistency maintenance; adding triggers does not populate pre-existing rows. [SQLite FTS5 documentation](https://sqlite.org/fts5.html).

BEIR compared retrieval systems across 18 datasets and found BM25 a robust baseline, while stronger reranking approaches carried additional computation. This is evidence for testing a lexical baseline, not a proof that BM25 wins on our repository or every current model. [BEIR](https://arxiv.org/abs/2104.08663).

**Proposed schema:** index path, symbol name, signature, doc heading, body, language, source kind, version, and provenance. Weight names/headings separately from long bodies. Preserve original strings and add normalized identifier forms, such as camel-case pieces, only as extra search fields.

Use exact path and symbol lookup before broad natural-language search. Keep an exact text-search tool for punctuation-sensitive expressions, error strings, and case-sensitive identifiers; tokenized FTS is not a substitute for every grep operation. Escape and parameterize query construction rather than letting arbitrary prose become unintended query operators.

Enforce workspace, version, and source-kind filters before evidence enters the prompt. Search candidates at a generous inexpensive K, deduplicate overlapping ranges, then expand the best few to complete functions or coherent document sections. Return a short relevance rationale and source locator, not an unbounded list.

**Identity:** query normalization version + query + filters + corpus generation + ranking configuration. Negative hits are invalidated by corpus changes too.

**Break-even:** amortize indexing over repeated queries. A short document already in context may need neither indexing nor retrieval.

**Experiment:** exact identifiers, stack traces, paraphrases, renamed functions, multilingual notes, symbol collisions, empty results, and deleted files. Measure Recall@K and answer/task success separately. High ranking scores are not confidence probabilities.

## 8 Embeddings hybrid retrieval and reranking

**Decision: Conditional. Establish a measured lexical failure first.**

Anthropic's contextual retrieval approach enriches each chunk with identifying context before indexing it, combines lexical and dense results, and optionally reranks. Its reported benefits come from its selected evaluation corpora and pipeline; they do not establish a laptop latency advantage. [Contextual retrieval](https://www.anthropic.com/engineering/contextual-retrieval).

**Proposed sequence:** try deterministic chunk metadata first—repository/path, enclosing symbol, document title, version, and section heading. Add embeddings only if paraphrased or cross-language queries still miss relevant evidence. Do not generate a model-written summary for every code chunk when syntax and metadata already supply the missing context.

A dense index is not sufficient by itself: live queries need a compatible query encoder. One resident generator is the initial policy, not a ban on auxiliary models. A small co-resident encoder or reranker is eligible if its full memory, scratch, scheduling interference and accepted-task benefit justify it. Sequential loading must count model-switch and cache-rewarming costs. General-purpose generator hidden states are not automatically good retrieval embeddings.

**Identity:** source-content digest + chunker version + metadata policy + embedding model/revision + dimensions + normalization + encoding settings. Re-embed affected chunks on changes; changing encoders requires an index migration. Query and document embeddings must inhabit the intended compatible space.

For hybrid ranking, use rank fusion rather than adding incomparable raw scores. One simple candidate is a sum of weighted reciprocal ranks, with a fixed positive smoothing constant. Tune weights on held-out queries and reserve exact symbol/path matches. Diversity and dependency coverage matter more than retrieving ten overlapping excerpts.

Rerank only a bounded candidate set. A small cross-encoder adds another learned runtime; a generative reranker can use the resident model but consumes serial inference and may disrupt its task prefix. A deterministic reranker based on paths, symbols, freshness, and coverage is the first comparison.

**Storage arithmetic:** N vectors × d dimensions × bytes per value. For 100,000 vectors of 384 float32 values, raw vectors alone occupy 153.6 MB, before metadata, search structures, and encoder memory.

**Gate:** adopt only if held-out relevant-evidence recall or accepted-task success improves enough to offset query encoding, ranking, and update costs. Track whether reranking reduces the context sufficiently to repay itself after considering existing prefix hits.

## 9 Context assembly ordering and truncation

**Decision: Treat prompt construction as a versioned deterministic function.**

Lost in the Middle found strong position effects in document QA and key-value retrieval. NoLiMa later tested retrieval with low lexical overlap and found pronounced degradation as context grew in the evaluated models. These findings motivate model-specific recall testing; they are not a guarantee that every modern model follows the same positional curve. [Lost in the Middle](https://arxiv.org/abs/2307.03172), [NoLiMa](https://arxiv.org/abs/2502.05167).

**Proposed layout:** stable concise operating instructions and core tool contracts first; stable task constraints and an evidence manifest next; append current evidence and recent tool outcomes; place the immediate request and acceptance criteria where the chosen chat template expects them. Preserve actual roles and tool-call/result pairing.

Within a task, prefer append-only evidence epochs so the runtime can reuse a prefix. Do not rewrite a repository map, date, timestamp, rotating tool list, or pretty-printed schema near the beginning every turn. A changed dynamic block can invalidate all subsequent cached tokens.

A source occurrence has an identity: source digest, range, extraction method, and truncation status. Deduplicate identical evidence, merge overlapping ranges, and include enough scope to interpret identifiers and pronouns. For code changes, preserve signatures, nearby invariants, and the relevant tests even when a relevance scorer prefers implementation lines.

Reserve output and tool-continuation space before assembling input. Select whole coherent units within the remaining budget. Mark omissions and provide a retrieval handle. Silent character clipping can remove a negation, function closing scope, source attribution, or a tool result's error.

**Break-even:** a larger cached prompt may avoid prefill while making every generated token attend to more history. Test both “retain hot evidence” and “rebuild a smaller prompt”; include the rebuilding cost.

**Experiment:** move a required constraint to the beginning, middle, and end; vary distractors; ask a paraphrased question; require two separated facts; and revisit a previously irrelevant source. Evaluate citations and actual task outcomes, not literal needle recall alone.

## 10 Compaction and durable task state

**Decision: Adopt structured task state and selective clearing before model-generated summaries.**

Anthropic describes compaction, external notes, and clearing old tool results as context-management techniques, while warning that aggressive summarization can discard details needed later. Its practical principle is to preserve useful state and retrieve source material when needed. [Context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

**Proposed durable record:** current goal, user constraints, decisions, open questions, files/artifacts changed, source versions, tests executed with outcomes, next actions, and outstanding obligations. Separate observed facts from hypotheses and failed approaches. Persist raw evidence outside the prompt so summaries can be checked.

After an operation completes, replace bulky disposable payloads at the next context rebuild with concise verified metadata and an object handle. Retain exact data needed for remaining work. Old test output may be compressible to command, dependency identity, exit status, failure summary, and full-log handle; an unresolved diagnostic needs enough detail to act.

A compaction creates a new context epoch. Account for lost prefix reuse, summary generation, and fresh prefill. Do not perform a summary call every turn. Trigger on approaching the input budget, clear irrelevance, or a task boundary where many future turns can benefit.

**Break-even:** expected future savings from reduced context and fewer errors must exceed summary cost plus prefix rebuilding. Purely deterministic pruning can be cheap; invoking the same slow local model to summarize ten lines is unlikely to help.

Retain a reversible history and structured records. A summary is a retrieval aid, not a new source of truth. Validate numerical values, filenames, constraints, and pending tasks against structured state before using it.

**Experiment:** force three compaction cycles through a multi-file fix and a sourced research task. Hide a rare but binding requirement early in the conversation, introduce a superseded decision, and interrupt after a failed tool. Require preservation of current constraints, correct supersession, and retrieval of original evidence.

## 11 Dynamic tools and skill loading

**Decision: Keep a small stable core and progressively load the rest.**

The Agent Skills specification separates catalog metadata, activated instructions, and supporting resources. Its client guide also covers activation deduplication and protection of active skill content during compaction. This supports a small catalog instead of loading every skill body into every request. [Agent Skills specification](https://agentskills.io/specification), [Client implementation guide](https://agentskills.io/client-implementation/adding-skills-support).

Anthropic's deferred tool system provides evidence that large catalogs can benefit from tool search, while explicitly acknowledging the additional search step. Its API keeps deferred tools out of the initial prefix; that implementation detail should not be assumed to hold in a local chat template. [Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use).

**Proposed local interface:** a compact fixed set for search, exact read, inspect symbols, apply guarded edit, run checks, and load a named procedure. Tool descriptions must distinguish their purpose and return bounded results. Search a catalog of optional tool/skill metadata only when the current task needs it.

For a small library, include concise schemas directly. Requiring a model round trip to discover one of four obvious tools adds avoidable latency. For a large library, deterministic task hints and lexical catalog search can shortlist candidates before a model decision.

Changing native function definitions can alter the rendered prompt before all conversation history, destroying prefix reuse. Inspect the chosen template. Options are stable toolsets per task epoch or a stable invocation interface with dynamically returned, versioned descriptors. The latter needs strict argument validation and explicit operation names.

**Identity:** descriptor/skill digest, dependencies, declared compatibility, and activation version. Re-read after content changes; do not silently apply an older cached procedure. Load referenced material only when needed, and keep active mandatory requirements in durable task state.

**Experiment:** compare four, twenty, and one hundred tools; include near-duplicate names and a missing capability. Measure selection accuracy, extra inference turns, prefix hit length, and latency. Promote dynamic discovery only after its context savings repay discovery.

## 12 Selective memory and reusable procedures

**Decision: Adopt a small verified memory; gate learned procedures through evidence.**

Reflexion uses textual feedback and episodic memory without weight updates. ACE organizes lessons as incrementally updated entries rather than repeatedly rewriting one monolithic context. These establish useful mechanisms, but their benchmark results do not prove that extra reflection calls pay off for a small local model. [Reflexion](https://arxiv.org/abs/2303.11366), [ACE](https://arxiv.org/html/2510.04618v1).

Apple's revised selective-memory study preserves specifications and configuration. Its public replication completed 12/12 selective-memory trials, 8/12 full-history trials, and 0/12 no-memory trials when an earlier formatting requirement was withheld. Selective versus full-history completion was not statistically established. Enterprise results were 23/24, 17/24, and 19/24 respectively, with no significant pairwise difference. The public comparison also differed in retained prior artifacts, so it does not isolate memory composition alone. [Selective persistent memory, revised paper](https://arxiv.org/abs/2607.09493v2).

**Proposed memory types:** explicit preferences; source-backed project facts; verified operation recipes; and pending task state. Each entry records scope, provenance, version dependencies, last validation, and supersession. Retrieve relevant entries; do not paste the entire memory into every prompt.

A reusable recipe should state applicability, required inputs, guarded steps, expected outputs, verification, and failure recovery. Prefer parameterized deterministic actions for stable repeated work. Reusing the procedure does not mean reusing its old data or cached success.

Candidate learning happens after verified outcomes or during idle time. Preserve small specific lessons such as a project-specific test command and its conditions. Discard speculative explanations unless marked as hypotheses. Count extraction, review, replay, and later maintenance against savings.

**Break-even:** across expected uses, saved model turns and avoided repairs must exceed procedure construction and validation cost. A one-off task rarely justifies a learned workflow.

**Experiment:** learn from one task, evaluate on held-out related tasks and deliberately incompatible near-matches, then change a dependency. Require correct refusal/fallback on mismatches and revalidation on change. A model's claim that its own lesson helped is not independent verification.

## 13 Reusable artifacts and zero model refresh

**Decision: Prefer executable artifacts for stable recurring data tasks.**

The selective-memory paper's separate refresh path succeeded in 12/12 trials with no model call, at a reported median 0.08 seconds. Schema compatibility was guaranteed by construction. Its controlled regeneration comparison was actually slower for selective memory: 140 seconds median versus 99 for full history. The benefit is skipping compatible refresh inference, not universally accelerating generation. [Selective memory and refresh contract](https://arxiv.org/abs/2607.09493v2).

**Proposed architecture:** when a report, calculation, query, or transformation has a stable specification, retain the validated program and run it on fresh inputs. Send the model only exceptions, changed requirements, schema changes, or genuinely new interpretation.

For example, a weekly repository status report can reuse deterministic collection and rendering. A CSV dashboard can refresh data when its schema and output contract remain compatible. A changing business definition requires a new model-assisted revision and validation.

The contract needs input schema, supported versions, units, missing-value behavior, transformation identity, output checks, and failure conditions. Reuse the code, not last week's answer. Changed input data invalidates derived results; it need not invalidate a compatible transformation.

**Break-even:** repeated execution savings must exceed initial program generation and testing. This can eliminate inference entirely for a repeated workload, which is stronger than accelerating token generation.

**Experiment:** refresh ordinary data, add optional columns, remove a required column, change a unit, introduce malformed rows, and change the output specification. Valid cases must run without the model; incompatible cases must fail visibly or enter a bounded revision path.

## 14 Attention eviction and compressed KV state

**Decision: Defer from the general coding baseline; allow a separately evaluated specialized profile.**

These mechanisms alter which past hidden states remain available. They are different from exact reuse and from lowering the numerical precision of every retained state.

| Family | Mechanism and source | Consequence for this architecture |
| --- | --- | --- |
| Attention sinks and StreamingLLM | Retain initial sink tokens plus recent context. The authors explicitly state that this does not expand the usable context window or preserve discarded long-term facts. [Official implementation and FAQ](https://github.com/mit-han-lab/streaming-llm) | Plausible for recent-context streaming. Unsuitable as an implicit substitute for recalling old coding constraints or summarizing a complete book. |
| H2O | Retain recent tokens and attention heavy hitters. The released implementations use Hugging Face and FlexGen paths. [H2O](https://github.com/FMInference/H2O) | Importance accumulated so far need not predict which rare earlier fact a later question will require. Budget attention-statistic collection and eviction. |
| SnapKV | Select per-head important prompt positions using an observation window near the prompt end. The published implementation patches selected Transformers architectures. [Paper](https://arxiv.org/abs/2404.14469), [implementation](https://github.com/FasterDecoding/SnapKV) | Candidate for long fixed prompts followed by generation. A new question about an evicted fact can invalidate the selection's usefulness. |
| PyramidKV | Allocate different cache budgets across layers, with more capacity in lower layers. Its reported LongBench results are model/task specific. [PyramidKV](https://arxiv.org/abs/2406.02069) | Requires layer-aware runtime support and evaluation on the chosen small model; a headline retained-cache percentage cannot be transferred to our workload. |

**Compatibility:** GGUF describes model data; it does not make a Hugging Face attention patch available in llama.cpp. Treat these methods as runtime integration projects unless the pinned backend explicitly implements and validates them. The inspected llama.cpp baseline provides ordinary cache controls, but this research does not establish a portable first-class implementation of all four methods across its CPU, GPU, NPU, and hybrid paths.

Do not equate native sliding-window attention in a trained architecture with deleting arbitrary cache entries from a full-attention model. Do not combine eviction, shifting, quantization, and speculation before measuring each separately. State snapshots must record the eviction policy, retained positions, and any policy statistics needed for continuation.

**Break-even:** saved allocation and attention traffic must exceed scoring, selecting, gathering, copying, and repair costs. A runtime that masks evicted entries without actually releasing storage may show logical sparsity without the expected memory savings.

**Experiment:** long code review followed by a question about an initially unimportant function; a constraint revealed early and used late; multi-hop references; repeated topic switches; and restore after eviction. Compare accepted outcomes, exact evidence recall, peak memory, and full-task latency. Defer any method that fails a critical recall case, even if perplexity or a literal-needle score remains good.

## 15 Prompt compression

**Decision: Use structural extraction now; defer learned token deletion from correctness-critical code.**

LLMLingua-2 trains a smaller encoder to select tokens for prompt compression. Its paper reports 1.6–2.9× end-to-end acceleration at 2–5× compression on its evaluated settings; those figures are not established for local GGUF coding agents. Its implementation is a separate compression pipeline. [LLMLingua-2](https://arxiv.org/abs/2403.12968), [Microsoft implementation](https://github.com/microsoft/LLMLingua).

**Proposed baseline:** remove duplicated excerpts, irrelevant logs, and generated/vendor content; extract complete function or document sections; retain exact identifiers, units, negations, constraints, provenance, and cross-reference targets. Store originals under evidence handles.

Learned extraction is lossy even when every retained token came from the source. Deleting “not,” a comparison operator, a scope delimiter, or one arm of a conditional can change meaning without inventing new words. Compress explanatory prose separately from source code, schemas, error messages, and executable instructions.

A learned compressor normally adds another model. Under strict single residency, include unloading/loading, cache eviction, and rewarming in the cost—or exclude it. Using the resident generator for summarization avoids concurrent second-model memory but adds serial inference and may consume the useful context it is trying to reduce.

**Break-even:** compressor time plus altered-prefix prefill must be below original prompt processing and subsequent decode time. If the original prompt is already cached, the opportunity can be much smaller. Repeated compressed artifacts should be keyed by original digest, compressor version, configuration, and task dependence.

**Experiment:** compare no compression, deterministic extraction, and learned compression at fixed quality criteria. Include numeric tables, negations, similar identifiers, source citations, multi-file dependencies, and questions introduced after compression. Require recovery from the original source and no silent alteration of critical constraints.

## 16 Learned hierarchical model memory

**Decision: Watch as model research; defer as an application feature.**

Apple's hierarchical-memory research augments a small anchor model with context-selected parameter blocks from a larger learned memory bank. Its example compares a 160M-parameter anchor using 18M selected parameters from a 4.6B bank with a larger conventional model. This is learned parametric memory, not a folder of retrieval documents. [Apple research](https://machinelearning.apple.com/research/hierarchical-memories).

The accompanying code uses Hugging Face wrappers, clustering, memory-bank training, and checkpointed configuration. Its post-hoc attachment path still needs compatible memory construction/training and model integration; it is not a universal performance toggle for an arbitrary GGUF file. [Apple implementation](https://github.com/apple/ml-memory-pretraining).

**Evaluation conditions:** a released compatible checkpoint, supported runtime operators and quantization, bounded active and stored memory, measured bank-fetch latency, and held-out task quality. Storage size and active parameter count must not be confused with total I/O or compute.

The useful architectural lesson is to make expensive knowledge selectively available. We can apply that principle today through external indexed evidence and verified procedures without adopting a new learned model architecture.

**Experiment if a suitable implementation arrives:** compare the complete system against the best fitting conventional model on the same laptop, including cold bank access, repetitive hits, random-topic misses, update cost, and network-free operation. Keep it outside the first build's dependency graph.

## 17 Shared validity and provenance contract

Each reusable object should carry enough information to explain what it is, where it came from, and which changes make it unusable. The following is the proposed application contract.

| Object | Minimum identity and invalidation inputs |
| --- | --- |
| Raw source object | Content digest, media type, origin, version, access scope. |
| Parsed syntax | Source digest, encoding, grammar, parser and extraction-query versions. |
| Resolved symbol/reference | Syntax identity, workspace config, dependency/toolchain state, editor overlay version. |
| Search result | Query, filters, ranking policy, corpus/index generation; includes negative results. |
| Embedding | Chunk content/context, encoder revision, dimensions, normalization, encoding parameters. |
| Prompt | Exact rendered tokens, roles/template version, ordered evidence versions, tool/skill versions. |
| Runtime state | Prompt-prefix identity, model/adapters, positional/attention configuration, backend/state-format compatibility. |
| Test result | Test identity, actual source/dependency closure, runner/toolchain/configuration/environment. |
| Memory lesson | Original evidence, supported scope, validation outcome, dependency conditions, supersession. |
| Executable recipe | Procedure version, input contract, action preconditions, current authorization, verification policy. |

A digest proves byte identity, not factual truth, freshness, or applicability. A recent timestamp does not prove relevance. A semantic match is a retrieval hint, not permission to reuse a previous answer or execute a procedure.

Use immutable evidence objects with mutable indexes and explicit supersession records. Revalidate references before writing to source files or asserting a current test result. If a cache entry cannot enumerate the dependencies needed for validity, narrow its use to an advisory historical record or rerun the underlying action.

Avoid automatically carrying a learned lesson between unrelated repositories. Prefer project scope by default, with explicit generalized entries only after evidence supports broader applicability. Give user corrections priority over inferred preferences and preserve the correction's provenance.

## 18 Concrete benchmark program

Use the same model, quantization, backend, prompt template, and task set while testing context mechanisms. Then evaluate alternative runtime profiles separately. Otherwise a better model can hide a faulty retrieval or cache design.

**Stage A measures component behavior.**

1. Prefix tests: 512, 2,048, and 8,192 token stable prefixes where supported; cold, hot, appended, early-edited, and restarted states.

2. Checkpoint tests: edit before and after each checkpoint; rewind beyond the supported range; restore after cancellation.

3. Index tests: initial build, one-file edit, mass rename, branch switch, unsaved buffer, generated file, and parser upgrade.

4. Retrieval tests: exact symbol, stack trace, paraphrase, cross-language query, absent answer, and two-hop dependency.

5. Invalidation tests: add a matching file after a negative search; preserve mtime while changing bytes; change configuration without editing the target.

6. Memory tests: repeat a compatible task, try a deceptive near-match, supersede a preference, and change a dependency.

7. Compression tests: preserve negations, units, numeric bounds, similarly named functions, and old-but-binding requirements.

8. Residency tests: invoke optional ranking/compression during warm interactive generation and include the full scheduling/switch cost.

**Stage B measures complete outcomes.**

Use representative small edits, cross-file fixes, unfamiliar API work, repository questions, sourced document answers, recurring data refresh, and long tasks with forced compaction. Each case needs expected evidence, behavioral checks, and clear success/failure rules. Include tasks whose correct outcome is to state that evidence is missing.

Collect wall-clock accepted-task latency, p50/p95, first useful response, new/cached prompt tokens, output tokens, tool/model turns, retries, recall at candidate K, citation correctness, invalidation failures, peak physical memory, swap/page faults, and background interference. Separate cold and warm runs. Repeat sustained runs with normal editor/browser load.

Use paired task trials and alternate configuration order. Keep a development set for tuning and a held-out set for promotion. Count failed and abandoned tasks; reporting speed only on successes can reward an unreliable optimization. Report uncertainty rather than treating a small seed suite as a precise p95 estimate.

## 19 Adoption gates and order

The thresholds below are proposed starting criteria. Tune them to real task frequency and quality requirements before running the comparison.

| Mechanism | Initial promotion gate |
| --- | --- |
| Exact prefix and state reuse | No invalid-state reuse; measurable prompt-time reduction on repeated tasks; bounded cache memory; no new failures in configuration-change cases. |
| Tool-result reuse | Zero incorrect hits in dependency-mutation tests; validation plus lookup below recomputation on the target operation class. |
| Incremental indexes | No stale edit application; initial indexing amortizes over expected use; warm update/search stay within a defined interactive budget. |
| Lexical plus symbols | At least 95% relevant-evidence Recall@20 on a representative labeled seed set, followed by task-quality validation; treat 95% as a target, not proof of completeness. |
| Dense retrieval or reranking | Demonstrable held-out recall/task improvement and positive total-latency benefit after encoding, loading, and cache interference. |
| Compaction | Preserve all binding constraints and open tasks in sentinel cases; future savings exceed summary and prefix-rebuild cost. |
| Dynamic tool loading | No loss of required-tool recall; reduction in context and failures repays additional discovery turns. |
| Learned recipe | Success on held-out compatible tasks, safe fallback on incompatible cases, and positive amortized savings. |
| Lossy KV or prompt compression | Zero newly broken critical recall cases; task-quality noninferiority established with sufficient trials; memory savings realized physically; total benefit positive. |

Predeclare a mechanism-specific minimum useful gain and quality criterion proportional to integration cost. A modest improvement may justify a low-risk configuration; a custom backend or learned component needs stronger, sustained evidence. Do not apply one universal speedup percentage or quality margin. Small seed suites cannot establish small noninferiority margins or rare-error rates. Binding constraints, stale writes and false success claims are hard failures irrespective of average scores.

**Implementation order:** instrument the baseline; add versioned evidence and guarded operations; implement bounded exact reuse; add lexical/symbol navigation; introduce structured memory and deliberate compaction; test procedure/artifact reuse; then evaluate dense ranking and lossy mechanisms only where remaining traces show a matching bottleneck.

For 8 GB, keep the default retrieval path model-free and minimize retained snapshots and background indexes. For 16 GB, larger indexes or a modest bounded state cache may fit, but available headroom is measured after the OS, editor, model, and compute workspace. A RAM tier alone does not authorize another resident model.

The governing rule is simple: every cache must prove validity, every lossy mechanism must prove adequate recall, and every added stage must repay its own cost.
