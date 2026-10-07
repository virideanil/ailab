# Kovan v0.1

A dependency-free Node 24 experiment harness and live visual observatory for a pluggable local GGUF coding assistant. This repository contains the standalone Kovan project.

## Current experiment

Eight explicit harness tasks compare a sequential tool loop with the same model given versioned contents of files named in the request. Six tasks require precise code/config transformations, two require grounded answers. These tasks validate the harness and explore a mechanism; they do not establish general coding ability. Gold scripts are used only with explicit `--fake`. Real mode never falls back to them.

Both arms use identical model settings, tool contracts, deadlines and private evaluators. Task order is counterbalanced. Context preparation counts toward time; private audit does not. Prompt caching is disabled in this first experiment, including within-task reuse. This is a deliberately simple baseline, not the best tuned conventional baseline required for final qualification.

The GGUF CI job downloads a SHA-256-pinned llama.cpp b11429 Linux CPU runtime and official Qwen2.5-Coder-1.5B-Instruct Q4_K_M control model, verifies both, runs a local server, measures both arms, and stops owned processes. Curated 0.5B and 1.5B profiles test integration and protocol reliability; weak answers remain failed outcomes.

## Run

Requires Node 24+. No npm install is needed.

```sh
npm test
npm run test:smoke
```

The second command is a **fake plumbing check**, not an AI speed benchmark.

With a trusted llama.cpp server already running on loopback:

```sh
node src/cli.mjs --endpoint http://127.0.0.1:8080 --model local --out artifacts/mac.json --repeats 3
```

The adapter uses the server's chat template and constrained JSON output. A replacement GGUF must support chat completion and this grammar; format compatibility is not a promise of model competence. No hosted API or credentials are required. Run one client at a time.

On Linux x64, `npm run test:gguf -- --profile coder-1.5b` provisions the pinned CPU runtime and 1.5B model automatically. `--profile coder-0.5b` selects the original smaller control (also the helper's default). Both profiles verify immutable revision, exact bytes and SHA-256. This download helper is Linux-only. On a Mac, install a trusted llama.cpp build with Metal support, choose a GGUF that fits unified memory, start `llama-server --model /absolute/path/model.gguf --alias local --host 127.0.0.1 --port 8080 --ctx-size 4096 --parallel 1`, then run the command above. Do not use Linux binaries on macOS.

## Evidence and boundaries

The included GitHub Actions workflow runs Node tests and fake integration on Linux and hosted macOS, followed by the real CPU experiment. Artifacts include exact source hashes, task/evaluator identities, tool events, snapshots, content hashes, model/runtime download digests, server log, outcome JSON and source archive. A green GGUF job means the experiment completed; inspect acceptance and failure counts for quality. Wrong answers are never an infrastructure pass disguised as model success.

Scoring retains failed and missing assignments, measures all-task completion time, and reports quality/cost deltas. Ratios are absent when either arm fails to complete half the assigned weighted tasks. Estimates have no confidence intervals and are explicitly ineligible for a performance claim. Sixteen previously executed adversarial scoring groups are included in Node tests.

The workspace is a bounded in-memory fixture store with synchronous compare-and-swap versions, unique literal edits and detached snapshots. It is **not an OS sandbox** or a real repository editor. Model output is never executed as shell/code. HTTP cancellation stops this client exchange; only the owned-server wrapper can additionally terminate its process group. No assertion is made that a shared server stops inference on disconnect.

Node RSS excludes model-server memory. GitHub CPUs and hosted Macs do not reproduce your Mac's memory bandwidth, thermal limits or battery behavior. The final system is not qualified until sustained device measurements and the larger held-out benchmark pass.

## Development gates

1. Foundation: validate lifecycle, measurement and real GGUF integration; retain all failures.
2. First ablation: compare demand-driven reads and bounded versioned context preload; diagnose failures before expanding.
3. Agent quality: actual behavioral code evaluators, representative tasks, best-fitting conventional models and tuned prompt-cache baselines.
4. Hardware: sweep threads, batch size, Metal offload, quantization, context/KV memory and thermal steady state; record total application memory and energy.
5. Experimental acceleration: speculative decoding/source drafts and budget routing only after correctness contracts hold. Each mechanism requires an isolated ablation and a fallback.
6. Qualification: frozen held-out suite, paired statistical analysis and confidence bounds, then hardware validation on the target Mac.

The governing [evaluation contract](docs/research/evaluation-contract.md) targets a statistically supported 2x gain with quality safeguards. This smoke suite cannot demonstrate that target.

## Visual observatory

`npm run dashboard` opens a local read-only telemetry service at http://127.0.0.1:8123. Open it in your browser, then run an experiment in another terminal. Kovan follows atomic result updates and live runner events; no illustrative numbers are injected. Real and fake modes are labeled explicitly. Only completed, graded outcomes enter acceptance and latency comparisons. A running clock is elapsed wall time, not a completed-result metric.

The interface uses warm charcoal, parchment, muted jade and copper, system sans text, Georgia display type and monospace telemetry. No external font or analytics requests. The visual workspace is part of the measurement tool and remains useful offline.

## Research and results

Start with the [architecture and roadmap](docs/research/architecture.md), [evaluation contract](docs/research/evaluation-contract.md), and [frontier experiments](docs/research/frontier-experiments.md). The architecture document links the five mechanism dossiers. These are research snapshots and proposals, not implemented feature claims.

[Recorded validation and real-model outcomes](RESULTS.md) distinguish passing infrastructure checks from task acceptance. Both 0.5B protocol revisions and the 1.5B control accepted no complete tasks under the fixed contract. The 1.5B control produced seven correct coding artifacts but failed final-answer requirements. This is a starting measurement, not a qualified coding assistant.

## Inspect the measured evidence

The complete reports and provenance for the first three real-model experiments are in [docs/validation](docs/validation). To view the recorded 1.5B run in the observatory:

```sh
npm run dashboard -- --artifacts docs/validation/003
```

This shows actual recorded measurements and failed outcomes. Start a new experiment with the normal artifacts directory for live telemetry.

[Verified desktop screenshot](docs/images/observatory-desktop.png) — captured during the explicitly labeled scripted browser test. Its numbers are harness checks. The real GGUF outcomes and remaining quality gates are in [RESULTS.md](RESULTS.md).
