# Host-managed engine pilot

This is a new execution protocol, not a retrospective repair of earlier scores. All historical reports, smoke prompts and smoke graders remain unchanged.

## Contract
The model proposes reads, literal edits, whole-file writes, optional semantic renames and final answers. The host owns file versions, exact-match validation, atomic multi-file commits, read-before-write requirements, read-only tasks, deadlines and output serialization. An edit proposal cannot invent a version. A finish action does not certify correctness: acceptance belongs to a separate evaluator.

Literal completion formats are enforced from public instructions or public outputContract metadata. Explicit key/value output templates and labeled ISO date requests have a bounded deterministic evidence extractor, shared across all arms. It requires observed source files; missing or conflicting fields yield UNKNOWN. This deliberately moves suitable structured extraction into software. Free-form reasoning still depends on the model; arbitrary hallucinations are not mechanically eliminated.

## Frozen diagnostic pilot
48 small JavaScript repairs/renames and 12 grounded evidence questions. Private cases and reference solutions never enter runtime tasks or model messages. The suite identity combines its manifest hash with the exact fixture source SHA-256. This preserves property encounter order, which affects several JavaScript tasks and is not represented by the manifest’s sorted-key canonicalization. Its commit precedes model runs. A correction after observations creates a new cohort; old evidence remains.

The verifier executes candidate code in a resource-limited, unprivileged, read-only Docker container with network disabled. Expected values remain in the host. This is stronger process isolation than a Node vm; it is not a defense against every kernel/container escape. Before model runs, all reference solutions must pass and all broken starters must fail.

## Baseline selection
Compare pinned Qwen2.5-Coder-1.5B, Qwen3-4B and Qwen2.5-Coder-3B GGUF Q4_K_M. Coder-3B is a noncommercial research comparator under the Qwen Research license, not the product default. Qwen3 uses its documented nonthinking sampler and disables thinking in the template. All arms use identical per-model sampling, JSON action grammar, 512-token response cap, 12-turn/30-second task limits and task-local prompt caching.

All eight original smoke checks must pass before a model enters the pilot. This is an integration gate, not evidence of coding capability. Among eligible models, prefer Qwen3-4B, then Coder-3B research, then the 1.5B reference; publish every outcome. Do not rank latency across different runner machines as a controlled comparison.

## Isolated acceleration
1. Context reuse: current prompt-mentioned files are preloaded with versions, under an 8 KiB content cap. If no path is mentioned and the workspace contains at most three files, preload that bounded workspace. This deterministic policy uses only public task data. Preparation is timed. Baseline reads normally. Pairs are counterbalanced on the same host.
2. Native editing: only the scope-aware TypeScript rename capability is added. Frozen eligibility is p45–p48; this is a four-task diagnostic, not evidence across the full coding population.
3. Prompt-lookup drafting: only llama.cpp ngram-simple is enabled, with n=4 and m=16. It may copy any matching prompt/history tokens, not exclusively source. Target sampling and grammar still verify tokens. Log attempted/accepted draft tokens and ordinary fallback.

The initial pilot is exploratory. Preserve assigned tasks, failed runs, invalid runs, grading time and hardware identities. Report accepted tasks and deadline-capped time to acceptance with the declared 80/20 coding/general weights. Never report faster failed completions as improvements. Promote no default based solely on a tiny positive point estimate; any quality regression, missing evidence or unmeasured laptop memory/thermal behavior blocks a broad speed claim. Final laptop admission and sustained performance require the user's actual Mac later.
