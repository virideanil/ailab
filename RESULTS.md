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

[Permanent result summaries](docs/validation/001-results.json) preserve the outcome counts, rounded task timings and bounded failure excerpts. Complete reports and server logs are CI artifacts with a 30-day retention period; source and this summary remain in Git.

Next diagnostic experiment: revise only the shared action protocol with explicit operation semantics and one unrelated worked example. Keep the model, tasks, evaluator, cache policy and deadlines fixed. This is development-set calibration, not held-out evidence.
