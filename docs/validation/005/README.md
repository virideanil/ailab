# Native required-tools diagnostic (incomplete)

Source 5405c0f5e33cbec388cdbbdc52402552dfa988b2, Actions run37702524351.
Coder-1.5B hit the512-token warmup cap; Coder-3B hit the60-second warmup timeout. Neither reached an assigned smoke task. Qwen3 completed four smoke assignments (three accepted); the run was cancelled when telemetry instrumentation was committed. These incomplete records cannot select a baseline or support any speed comparison. Its empty-guard edit added an unrequested blank line and failed the unchanged exact-content smoke grader.

All model reports and available provenance are retained. The next cohort separates a one-token hardware warmup from task admission, preserves rejected native responses, uses auto tool choice with strict single-call validation, and instructs all models to preserve unrelated text/formatting. The pinned required-tools grammar permits arbitrary prefixes and repeated calls; failure details require raw response evidence, not assumptions about model competence.
