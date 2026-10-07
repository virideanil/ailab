# Experiment 003: a larger model in the same family

Registered on 7 October 2026 before this model's outputs. [Previous outcome](../validation/002-results.json): 0/8 accepted in both arms after one shared protocol revision. Stop further prompt tuning on these eight fixtures; test a model control instead.

## Hypothesis and control

Qwen2.5-Coder-1.5B-Instruct Q4_K_M may follow the fixed action protocol more reliably than the 0.5B checkpoint. Keep protocol v2, eight development tasks, exact evaluator, baseline/candidate mechanisms, runtime b11429, two CPU threads, no GPU offload, context 4096, one active slot, cache_prompt false, 256-token completions, seed 42, temperature zero, max 12 turns and the 30-second task deadline unchanged.

This is a model-profile comparison, not proof that parameter count alone caused a change. Checkpoints have different learned weights and may have other architectural/training differences. Runs use the same GitHub-hosted runner class, not guaranteed identical physical hardware. Exact hardware is recorded in each full report. Baseline/candidate comparisons within a run remain the primary controlled comparison.

## Pin and admission

- Repository: Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF
- Revision: 2ab9f8f42af02fc212effaef7c4850c885e965f4
- File: qwen2.5-coder-1.5b-instruct-q4_k_m.gguf
- SHA-256: cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046
- Bytes: 1117320768, approximately 1.041 GiB
- Evidence: [official upload commit](https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/commit/2ab9f8f42af02fc212effaef7c4850c885e965f4)

The wrapper now chooses a curated profile and downloads from an immutable revision. Exact byte count and SHA-256 must both match before execution. File size alone does not establish total runtime memory or admission on an 8 GB laptop. These are integration controls, not quality-qualified product defaults.

Run with `npm run test:gguf -- --profile coder-1.5b`. The prior weight file remains available through `--profile coder-0.5b` and retains its original digest.

## Decision

Keep all assigned outcomes and exact-format failures. Report acceptance and all-task T50 where reached, otherwise no ratio. A timeout can show this profile is too slow under this CPU budget; it does not establish that the underlying model is incapable at a longer budget. Improvements remain development evidence and require independent behavioral tasks, tuned conventional baselines, more models, resource accounting and target-laptop qualification.
