# Conventional baseline probe: host-proposals-v1

Source commit: 71a08c5761f65cc64a8e32da255f7d9eac0a1610.
[Actions run 37700855038](https://github.com/virideanil/ailab/actions/runs/37700855038).

All raw outcome traces and provenance are retained in the profile subdirectories. Coder-1.5B accepted 1/8, Coder-3B Research 4/8, and Qwen3-4B 2/8. Every task had a 30-second limit and up to 12 turns. No model qualified; no fresh pilot or acceleration comparisons ran.

This probe used constrained JSON assistant content with observations in user messages and repeated requests. The traces show unread edit attempts, repeated successful edits, premature or repeated finish actions, and deadlines. Prompt cache reuse was observed. These failures are retained as evidence of an inadequate conventional protocol, not evidence of acceleration.

The next cohort uses model-native tool calls, matching tool responses, one initial request, four inference/prefill threads, and the original smoke fixture's 120-second limit. Frozen pilot deadlines remain 30 seconds. Combined changes mean comparisons against this cohort cannot isolate any causal speedup. CPU models differ between these runs; cross-host raw timings are not comparable.
