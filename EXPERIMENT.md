# Experiment 001: versioned context preload

Status: exploratory smoke. Register this design before examining real outputs.

Hypothesis: supplying bounded current contents and versions for files explicitly named in a request reduces tool/model round trips without reducing exact task acceptance.

Arms:
- Baseline: model sees request and filenames, requests its own tools.
- Candidate: same prompt, model, grammar, tools and limits; host additionally supplies files whose complete path occurs literally in the request. No evaluator-derived selection.
- Both: one action per completion, 256 generated tokens per call, temperature 0, seed 42, prompt cache disabled, max 12 turns, 30 second default end-to-end task deadline, 4096 runtime context, one active task.

Selection uses no hidden answers, task IDs or gold scripts. It has no semantic retriever or learned router. Storage is in-memory. Any timing difference must be attributed only to this bounded-context mechanism and its changed conversation, not to a new inference algorithm.

Eight harness fixtures are fixed before the run. Six exact transformations and two evidence tasks use a private snapshot/answer evaluator. Exact edits are specified explicitly; this is not a test of arbitrary semantically equivalent patches. Grading time is excluded; model, tools, context selection and artifact capture are included. Preparation consumes the original deadline.

Order alternates baseline/candidate by task and repeat. A single model warmup precedes the run. Each request disables cache reuse to avoid inter-arm prefix leakage. This also weakens a conventional within-task cache baseline; a tuned cache experiment is mandatory later.

Reported evidence:
- Every assigned outcome, including refusal, deadline, malformed action and adapter error.
- Weighted acceptance (80% coding / 20% general), all-task completion distribution, T50 where reached, capped success-adjusted cost and observed failure latency.
- Source and task/evaluator hashes, action transcript, per-file SHA-256 and versions, model/runtime checksums and host metadata.
- Point estimates only; no confidence interval, statistical significance or 2x achievement claim.
- Fake runs are plumbing checks and are labeled separately.

A valid but inaccurate model run is preserved. Harness corruption invalidates the measurement instead of becoming model failure. Model failures trigger transcript diagnosis and a new versioned experiment; do not delete difficult fixtures or replace real responses with scripted ones.

Promotion requires larger independent behavioral code tests, multiple GGUF models, tuned conventional baselines, total process memory/energy measurements, sustained workloads and target-device qualification. The initial eight fixtures are not reused as held-out evidence.
