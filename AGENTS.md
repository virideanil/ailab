# Working on Kovan

This is a research workbench for fast local AI on consumer laptops. Primary target: user's Apple M5 Mac with 16 GB unified memory. Current runnable scope is bounded in-memory task fixtures, not arbitrary repository editing.

Read HANDOFF.md, docs/ENGINE-PILOT.md and RESULTS.md before changing experiment behavior. Research proposals live in docs/research; do not describe them as implemented or measured.

- Use Node 24+, npm ci, npm test. Start the real-evidence GUI with npm start.
- Use src/engine-cli.mjs for current experiments; preserve the legacy runner and historical reports.
- Host owns file revisions, validation, output formatting, timing and completion state. The model proposes actions and answers.
- Private expected answers and grading cannot influence model messages, routing, budgets, retries or stopping.
- Do not alter original smoke prompts/graders or frozen pilot data to repair measured failures. New data or protocols need a named cohort and retained prior evidence.
- Record exact code/model/runtime/evaluator identities, hardware and cache policy. Preserve failed and missing assignments.
- A successful workflow or accepted draft token is not an accepted task. No speed claim without quality-preserving accepted-result measurements.
- Relevant checks: npm run engine:self-test; RUN_DOCKER_EVALUATOR_TESTS=1 npm test and npm run pilot:admission with a prepared Linux Docker engine.
- The GUI must display real telemetry, label scripted runs, and retain uncertainty. It is read-only.
- Keep models, local artifacts, credentials and node_modules out of Git. Do not overwrite user edits or change system-wide security settings.
