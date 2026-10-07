# Validation and experimental results

## Experiment 001 — action protocol v1

Tested source: [5d54d92](https://github.com/virideanil/ailab/commit/5d54d925f8702e978a34b297fe8ff805d1a84d82). [CI run](https://github.com/virideanil/ailab/actions/runs/37692515198), 7 October 2026.

- Linux: 62/62 unit and adversarial tests; all 16 scripted outcomes accepted.
- Hosted macOS: 62/62 unit and adversarial tests; all 16 scripted outcomes accepted.
- Chromium: empty-state honesty, fake/real labels, live SSE updates, desktop/mobile overflow, untrusted file text, incomplete metrics and weighted CDF checks passed. Desktop screenshot visually inspected.
- Real CPU GGUF: all 16 assigned runs completed as valid measurements. **Baseline 0/8 accepted; candidate 0/8 accepted.** Weighted acceptance is 0% for both; T50 is unreached and the ratio is unavailable.
- Owned server cleanup and source packaging passed.

A green workflow verifies that the experiment ran and recorded outcomes. It does not certify model quality. The scripted results are harness checks, never AI performance evidence.

The six coding tasks per arm ended with unchanged files, often after listing files and immediately claiming completion. General evidence tasks repeated reads/listing; three hit the deadline and one reached the turn limit. Preloaded context did not overcome this action-selection failure. No speedup or useful coding capability was demonstrated.

[Permanent result summaries](docs/validation/001-results.json) preserve the outcome counts, rounded task timings and bounded failure excerpts. Complete reports and server logs are now also preserved in Git; see the permanent-evidence table below. CI artifacts retain their original expiration dates.

Next diagnostic experiment: revise only the shared action protocol with explicit operation semantics and one unrelated worked example. Keep the model, tasks, evaluator, cache policy and deadlines fixed. This is development-set calibration, not held-out evidence.

## Experiment 002 — action protocol v2

Tested source: [cc7aaa4](https://github.com/virideanil/ailab/commit/cc7aaa46c4cab6d9f6ab812a26f2d978ef7fb8b4). [CI run](https://github.com/virideanil/ailab/actions/runs/37693107601). [Registered change](docs/experiments/002-action-protocol.md). [Permanent summaries](docs/validation/002-results.json).

All Linux, hosted macOS, browser, GGUF lifecycle and packaging checks passed again. **Task acceptance remained 0/8 baseline and 0/8 candidate.** All 16 measurements were valid. T50 remained unreached; no speed ratio exists.

The more explicit protocol induced edits, but did not establish useful task completion. Failures included repeated or reverted edits, stale version guesses, invented exact strings, repeated reads and final-answer format violations. Those are retained failures. No evaluator was relaxed. This development-set revision is not an improvement in accepted-task quality and should not be promoted as one.

Next control: compare the same protocol and limits with the officially pinned 1.5B model. This changes the model profile; it does not silently replace the failed 0.5B evidence.

## Experiment 003 — pinned 1.5B control

Tested source: [2d8844d](https://github.com/virideanil/ailab/commit/2d8844d20f3bdd1871315fda14d68f289a35fdce). [CI run](https://github.com/virideanil/ailab/actions/runs/37694118751). [Registered design](docs/experiments/003-model-control.md). [Permanent summaries](docs/validation/003-results.json).

All Linux, hosted macOS, browser, real GGUF lifecycle and packaging checks passed. **Baseline 0/8 fully accepted; candidate 0/8 fully accepted.** All 16 measurements were valid. Weighted acceptance remained 0%; T50 was unreached and no speed ratio is available.

Diagnostic progress: the host evaluator confirmed exact file contents in **7 of the 12 coding assignments** (3 baseline, 4 candidate). These still failed their explicitly requested final-answer format. That partial result is not task acceptance. Two other coding attempts were rejected for an empty oldText action field; remaining coding failures included incorrect per-file versions, unmatched literal edits and deadlines. The evidence-answer tasks used the wrong requested format, and both missing-date tasks hallucinated 2023-04-15 instead of answering UNKNOWN.

The action schema currently permits empty strings that the runtime validator rejects for path, query and oldText. Tightening those constraints and improving how public task requirements survive tool observations are concrete protocol work. Neither permits relaxing a private evaluator after seeing failures. Empty-argument errors, exact-text errors and deadline failures must remain distinguishable.

The real-model jobs ran on different hosted CPU models: experiment 001 used Xeon Platinum 8370C; 002 used Xeon Platinum 8573C; 003 used AMD EPYC 7763. Each exposed four logical CPUs and about 16 GB RAM; llama-server used two threads. Between-run timings are not a hardware-controlled model-size or prompt-speed comparison. None of these runs qualifies an 8 GB laptop or the target Mac.

## Permanent evidence and current decision

All three full reports, runtime/model provenance files and bounded server logs are retained in Git:

| Experiment | Full report | Provenance | Server log |
| --- | --- | --- | --- |
| 001: 0.5B, protocol v1 | [report](docs/validation/001/real.json) | [provenance](docs/validation/001/real-provenance.json) | [log](docs/validation/001/llama-server.log) |
| 002: 0.5B, protocol v2 | [report](docs/validation/002/real.json) | [provenance](docs/validation/002/real-provenance.json) | [log](docs/validation/002/llama-server.log) |
| 003: 1.5B, protocol v2 | [report](docs/validation/003/real.json) | [provenance](docs/validation/003/real-provenance.json) | [log](docs/validation/003/llama-server.log) |

[Evidence capture job](https://github.com/virideanil/ailab/actions/runs/37694735341) verified the source commit for each run and extracted the existing artifacts without repeating inference. JSON is stored in readable form; artifact ZIP digests remain in the result summaries. The copies in this repository do not expire with Actions artifacts.

**Foundation gate: passed. Agent-quality and speed gates: open.** The project is a working, tested experimental harness and visual observatory, not a qualified coding assistant. Stop further prompt tuning against these eight fixtures. Prioritize schema/runtime agreement, robust public task state, explicit abstention, independent behavioral code tests, and a stronger conventional baseline with measured cache policy before interpreting acceleration. The [research roadmap](docs/research/architecture.md) retains the experimental branches; the [evaluation contract](docs/research/evaluation-contract.md) still governs promotion.
