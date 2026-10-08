# Kovan

A local AI research workbench with a live visual observatory, pluggable GGUF models and a host-managed execution engine. Target device: **M5 Mac, 16 GB unified memory**.

Start with **[START-HERE.md](START-HERE.md)** and the **[Mac guide](docs/MAC-HANDOFF.md)**. The package contains code, tests, research and retained experiment evidence. Models and native runtimes are installed separately.

```sh
npm ci
npm test
npm start
```

Requires Node 24+. The GUI opens at http://127.0.0.1:8123, seeds actual recorded results, and follows new reports in `artifacts/`. It is read-only; the CLI starts experiments. Scripted checks are explicitly labeled and never presented as AI performance.

## Engine and experiments

The host owns file versions, atomic edit validation, observed evidence, public output contracts and measured completion. The model proposes actions and reasons about evidence. Private grading runs only after submission.

The [current protocol](docs/ENGINE-PILOT.md) compares conventional pinned GGUF models before a frozen 60-task behavioral pilot and isolated context reuse, semantic rename and prompt-lookup experiments. Original smoke prompts/graders remain unchanged. The TypeScript semantic editor uses a pinned dependency installed by npm ci.

```sh
npm run engine:self-test
npm run mac:doctor
npm run model:fetch -- --profile qwen3-4b
```

The self-test uses gold scripts, not inference. The downloader verifies the publisher revision, size and SHA-256. See the Mac guide for native Metal server commands and the current engine CLI. The automated `npm run test:gguf` provisioner is Linux x64 only; the legacy experiment is retained as `test:gguf:legacy`.

## Evidence and limits

Read [RESULTS.md](RESULTS.md) and [HANDOFF.md](HANDOFF.md) for accepted outcomes, failures and outstanding gates. A green workflow means an experiment completed; inspect its task acceptance.

The workspace is an in-memory fixture store, not a general repository editor. Proposed JavaScript is graded in restricted Docker containers; it is never run directly in the host process. Docker is optional for recorded viewing/original smoke and required for fresh behavioral coding tests. Mac container support requires device validation.

The current default measures controlled model/prefix-warm operation: startup priming is recorded separately, and task-local re-priming is timed to prevent cross-arm task-content reuse. The earlier task-cold regime remains available with --cache task-local; cohorts remain separate. No qualified laptop speedup, sustained thermal result or general coding competence is claimed.

## Design and research

The observatory uses warm charcoal, parchment, muted jade and copper, system sans text, Georgia display type and monospace telemetry. Fonts and assets remain local. It shows task status, acceptance, tool traces, file contents, comparisons and provenance without fabricated telemetry.

[Architecture and roadmap](docs/research/architecture.md) · [Evaluation contract](docs/research/evaluation-contract.md) · [Frontier mechanisms](docs/research/frontier-experiments.md)

Research documents describe both implemented foundations and untested proposals. Keep that distinction when continuing development.
