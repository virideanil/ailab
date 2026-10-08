# Kovan on your M5 / 16 GB Mac

The observatory, engine, research, frozen fixtures and retained evidence are in this pack. Native inference runs through llama.cpp/Metal. The GUI is read-only and follows real reports; it does not launch jobs. Models, Node, llama.cpp and Docker are separate installations.

## 1. Open the workbench

Install Node.js 24 or newer, then open Terminal in the project folder:

```sh
npm ci
npm run mac:doctor
npm test
npm start
```

Or double-click **Launch Kovan.command** after installing Node. The GUI opens at http://127.0.0.1:8123 and seeds the artifacts folder with preserved real experiments. It never substitutes demonstration numbers. Keep the Terminal window open; Control-C stops the GUI.

If the port is busy, use `npm start -- --port 8124`. To use a separate workspace, add `--artifacts artifacts/mac-session` and write experiment reports there too. `--empty` opens without seeding historical reports.

The doctor writes `artifacts/mac-doctor.json` with CPU, memory, OS, Node, llama.cpp availability, Docker availability and checkout identity. It makes no system changes. An extracted ZIP has no Git history; use a clone for ongoing commits.

## 2. Install native inference and a model

Use a trusted native llama.cpp build. If Homebrew is already installed, `brew install llama.cpp` is one option. This is a rolling runtime version, distinct from the pinned Linux CI build. Record `llama-server --version`.

For exact source parity, build llama.cpp commit `d81235049384534c167caea52b85a694f6103d14` with CMake and `GGML_METAL=ON`; do not use the Linux binaries on macOS. Xcode command-line tools are needed to build.

Start with pinned **Qwen3-4B Q4_K_M** (2.50 GB download) as a memory-conscious experiment, not a quality-qualified winner:

```sh
npm run model:fetch -- --profile qwen3-4b
```

The downloader checks immutable publisher revision, exact bytes and SHA-256, refuses a conflicting existing model and downloads no runtime. The model license is Apache-2.0. Other pinned controls are listed in `src/model-profiles.mjs`; the 3B Coder comparator has a research-only license.

For arbitrary GGUFs, retain your own trusted model path and digest. GGUF format compatibility does not establish usable tool behavior or coding quality.

Start the native server in another Terminal:

```sh
mkdir -p artifacts
llama-server --version > artifacts/mac-runtime.txt 2>&1
shasum -a 256 models/Qwen3-4B-Q4_K_M.gguf > artifacts/mac-model.sha256

llama-server \
  --model "$PWD/models/Qwen3-4B-Q4_K_M.gguf" \
  --alias local --host 127.0.0.1 --port 8080 \
  --ctx-size 4096 --parallel 1 \
  --threads 4 --threads-batch 4 --n-gpu-layers 99 \
  --jinja --metrics --cache-ram 0 --no-cache-idle-slots \
  --spec-type none > artifacts/mac-server.log 2>&1
```

Confirm Metal offload in the log. Four threads and 4K context are starting settings, not measured M5 optima. Keep the server running and use one experiment client at a time. The CLI does not own or stop an externally launched server.

The 16 GB total is shared by macOS, the model, KV/scratch buffers, browser and any Docker VM. Model file size is not peak application memory. Begin with other heavy applications closed; measure memory pressure and sustained behavior before larger models or contexts.

## 3. Run the unchanged smoke gate

Keep the GUI running; use another Terminal:

```sh
node src/engine-cli.mjs \
  --endpoint http://127.0.0.1:8080 --model local --profile qwen3-4b \
  --suite smoke --arm baseline --repeats 1 \
  --out artifacts/mac-smoke-qwen3.json
```

The GUI follows task progress, tool actions, file changes and completed acceptance results. A green exit means measurement completed, not that every task passed. Require **8/8** before the fresh pilot.

The profile selects sampling and metadata; it does not verify the external server's loaded model. Match it to the model you started. For an unlisted GGUF, use `--profile external` and retain its identity/settings separately. Qwen3's profile applies its documented nonthinking sampler.

`npm run engine:self-test` uses explicit scripted gold actions. It is a plumbing check, clearly labeled fake, and is not AI performance evidence. The older `src/cli.mjs` remains for historical reproduction; use `src/engine-cli.mjs` for current work.

## 4. Enable isolated behavioral tests

Docker is unnecessary for recorded viewing and original smoke. The fresh 60-task pilot executes proposed JavaScript in restricted Linux containers and requires Docker Desktop running with Linux containers. There is no unsandboxed fallback.

Use a directory inside this project for Docker-shared temporary files:

```sh
mkdir -p .kovan/grading
export KOVAN_EVALUATOR_TMPDIR="$PWD/.kovan/grading"
docker pull node:24-bookworm-slim
RUN_DOCKER_EVALUATOR_TESTS=1 npm test
npm run pilot:admission
```

All references must pass and all deliberately wrong starters must fail. If Docker cannot mount the directory, enable sharing for the project directory in Docker Desktop. Keep isolation flags unchanged. Linux CI executes the actual Docker checks; Docker Desktop and Metal still need validation on your M5. Default macOS unit tests do not claim that validation.

After the eight model smoke tasks and evaluator admission pass:

```sh
node src/engine-cli.mjs \
  --endpoint http://127.0.0.1:8080 --model local --profile qwen3-4b \
  --suite pilot --arm context --repeats 1 \
  --out artifacts/mac-pilot-context.json

node src/engine-cli.mjs \
  --endpoint http://127.0.0.1:8080 --model local --profile qwen3-4b \
  --suite native --arm native --repeats 3 \
  --out artifacts/mac-native-rename.json
```

The first command compares ordinary reads and bounded versioned context across all 60 tasks. The second is a separate four-task semantic-rename diagnostic. Do not combine their quality denominators. Prompt-lookup drafting needs two separately configured server blocks; its current automated provisioner is Linux-only. Port that wrapper separately before comparing on Mac.

## 5. Continue development

Read [HANDOFF.md](../HANDOFF.md), [ENGINE-PILOT.md](ENGINE-PILOT.md), [RESULTS.md](../RESULTS.md) and the [evaluation contract](research/evaluation-contract.md).

Paste into a coding agent opened in this repository:

> Read AGENTS.md and HANDOFF.md. We are continuing Kovan on an M5 Mac with 16 GB unified memory. Inspect the actual checkout and installed tools. Start the recorded GUI, record hardware/runtime/model identities, and run current tests and the unchanged smoke gate with native Metal. Preserve every failure and frozen fixture. Keep private grading outside model/runtime decisions. Establish a properly configured conventional baseline before isolated acceleration experiments. Record cold startup, reusable-prefix priming, warm accepted-task time and total memory separately. Update HANDOFF.md and RESULTS.md with real evidence. Do not claim speed from failed completions or relax a grader to pass.

The shipped default is controlled **model/prefix-warm** operation. Initial system/tool priming is recorded as startup; every task re-primes a fixed public prefix inside its measured budget so paired arms cannot inherit task-specific cached content. Context arms share a tool schema. The native diagnostic alternates different schemas in one cache slot: only the last schema remains warm, and timed preparation includes schema-switch reprocessing. Treat it as a single-slot diagnostic, not a clean per-schema warm speed comparison; use separate counterbalanced server blocks for that later study. Failed/cancelled preparation consumes wall time even when token telemetry is unavailable. Use --cache task-local for the earlier task-cold control, and keep those results in a separate cohort. Check actual cache counters; never re-label old cold runs as warm.

Use normal Git commits. For a clean checkout, `git pull --ff-only` receives later online work. This archive contains a snapshot; it will not sync itself.

## Evidence and shutdown

Preserve `artifacts/`, server logs, model digest and runtime version. Reports distinguish accepted outcomes, deadlines, protocol failures, missing assignments and grading time. No completed laptop speedup has been established.

Stop experiment, GUI and externally started server with Control-C in their respective terminals. Container cleanup is owned by the evaluator; an external llama-server remains your responsibility.
