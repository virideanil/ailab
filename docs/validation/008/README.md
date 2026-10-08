# Normalized proposals, task-cold cache

Source f9225ef70e7507de138ae4df6eae70ba5730252a; [Actions run37705821946](https://github.com/virideanil/ailab/actions/runs/37705821946).
Accepted: Coder1.5B1/8, Coder3B Research3/8, Qwen3-4B6/8. No model qualified.
Qwen3 failed a120-second rename deadline and a response with both commentary and a valid native call. The smaller models still produced malformed/multiple proposals or failed read-before-write recovery.
All raw reports/provenance are retained. Every task's first request recomputed the static tool/system prefix.
The next cohort allows standard native-call commentary and measures a controlled warm-prefix baseline. Earlier timings cannot isolate that cache change from the protocol fix or different CPU hosts.
