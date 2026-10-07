# Experiment 002: clarify the shared action protocol

Registered before this revision's GGUF outputs on 7 October 2026. Supersedes no earlier evidence; [experiment 001](../validation/001-results.json) remains recorded.

## Trigger and hypothesis

The 0.5B model finished all coding tasks without applying edits and repeatedly requested observations for evidence tasks. The protocol listed action shapes but provided little execution semantics. Explicit effects and one unrelated worked example may improve action selection enough to produce accepted tasks.

## Controlled change

Only the shared adapter instruction changes. It explains each action's effect, says finish cannot edit files, preserves the original request across host observations, distinguishes editing from evidence questions, and illustrates one read/replace/finish sequence on color.txt. It explicitly allows starting with replace_text when Initial context already contains the file and version. Observations in the example are labeled illustrative.

Both baseline and candidate receive this identical instruction. No task IDs, fixture answers, gold scripts, or evaluator outputs are included in it. Existing user requests already state their requested edits and answer formats.

The GGUF/runtime pins, temperature 0, seed 42, 256-token output cap, cache_prompt false, 12 turns, 30-second task deadline, one warmup, eight tasks, evaluator, weights and counterbalanced order remain fixed. The longer prompt's model processing time counts. Source hashes and modelProfile.protocol identify this revision.

## Interpretation and stop rule

Rerun every task in both arms. Preserve all failures. Report acceptance, actions, deadlines and all-task T50; never report a ratio unless both arms reach half the assigned weighted tasks. The eight tasks are a development set because their failures informed this change. A useful result motivates independent tasks and model comparisons; it does not qualify the system or prove a speedup. Do not continue unbounded prompt tuning against these fixtures.
