# Kovan handoff — M5 / 16 GB

## What exists

Host-managed versioned edits, native tool/strict JSON proposal compatibility, public output/evidence contracts, a read-only live observatory, three pinned model comparators, unchanged original smoke fixtures, and a frozen 60-task behavioral pilot (48 coding / 12 general; 281 private assertions). Native semantic renames and prompt-lookup speculation have isolated experimental paths.

The Mac pack adds a launcher, setup doctor, verified GGUF downloader and Docker Desktop host path. Node/UI checks run on hosted macOS; actual M5 Metal and Docker Desktop have not been exercised here.

## Current evidence

Cohorts 001–003 remain untouched. Host-proposals-v1 (004) accepted 1/8 with Coder 1.5B, 4/8 with Coder 3B Research and 2/8 with Qwen3-4B under a 30-second probe.
Required native tools (005 incomplete;006 full) exposed warmup/serialization failures; Qwen3 reached 7/8 in 006.
Auto native tools (007) accepted 0/8 for each Coder due to fenced JSON framing, and6/8 for Qwen3. All six Qwen3 coding edits passed; two source-grounded answers were rejected as ordinary assistant prose.
These failures are preserved. V4 (008) accepted1/8,3/8 and6/8 respectively. The latest v5 cohort adds a controlled warm-prefix baseline and accepts normal native-call commentary. It must pass its own new run and never rewrites earlier scores.

The original smoke checks and all 60 reference/starter admission checks have passed with scripted gold proposals. Scripted success is not model success. No fresh model pilot or acceleration result was available at this handoff's initial preparation; check the linked Actions run and later results before making claims.

## Continue from here

1. Finish/inspect the v5 conventional model tournament. Require 8/8 original smoke before pilot.
2. On Mac, record actual chip/RAM, runtime, GGUF digest and flags. Verify Metal and Docker admission.
3. Verify the shipped warm-prefix policy on the Mac: initial startup is separate; per-task public re-priming is timed and prevents cross-arm task-content reuse. Keep the task-cold control separate and compare acceptance as well as latency.
4. Run the 60-task behavioral pilot, retaining failures and private grading separation.
5. Compare context reuse, native rename and prompt-lookup drafting individually. Keep only improvements that reduce accepted-result time without sacrificing quality.
6. Measure unified memory pressure, Docker VM overhead, thermals and sustained operation on the M5 before laptop claims.

Use the GUI and commands in docs/MAC-HANDOFF.md. Source modules under src/, experiments under scripts/, frozen fixtures under fixtures/, tests under tests/, and retained evidence under docs/validation/. No production agent deployment or broad coding competence is claimed.
