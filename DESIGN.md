# Kovan — design system

A local intelligence observatory. A place to understand what the machine is doing, keep useful experiments, and see failure clearly.

## Character

Quiet, warm and precise. Editorial rhythm gives the workspace room to breathe. Instruments carry evidence, not decoration. The interface should reward a long session of attentive work without demanding attention itself.

## Palette

| Token | Hex | Role | Contrast on ink |
|---|---|---|---|
| Ink | #171b19 | Main background | — |
| Paper | #eee9df | Primary text | 14.38:1 |
| Quiet | #aaafa5 | Secondary text | 7.77:1 |
| Jade | #a7c7b0 | Accepted results, active selection | 9.48:1 |
| Copper | #c99774 | Baseline, focus and emphasis | 6.76:1 |
| Surface | #202722 | Panels | Recheck actual foreground pairs |
| Rule | #39433c | Decorative separators | Never the only status signal |

Ratios above were calculated with the WCAG relative-luminance formula. They qualify those pairs only, not the entire application. Status always includes readable words or symbols; color is additional information.

## Typography

- Display: Georgia, then a system serif. Restrained editorial headings, 36–56px desktop and 28–36px narrow screens.
- Body and controls: system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif. 14–16px with comfortable line height.
- Measurements, IDs and code: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace. Tabular numbers; text remains selectable.
- Small labels: 11–12px, modest letter spacing; never long paragraphs in capitals.

Everything works offline. No remote fonts, trackers or decoration downloads.

## Composition

A compact identity/navigation rail, broad experiment canvas and optional detail inspector. The experiment selector and connection state remain easy to find. Summary precedes comparison; comparisons precede individual evidence. At narrow widths, panels become a single readable stack. Charts receive explicit labels and equivalent numerical data.

Use a 4px spacing base, usually 8/12/16/24/32/48. Soft 12–18px panel corners and thin boundaries. Avoid nested boxes around every number. Maintain a clear hierarchy between navigation, instrumentation and artifact text.

## Motion and interaction

Short 120–180ms opacity/color transitions orient attention. No perpetual decorative movement. Reduced-motion preference disables nonessential animation. Visible keyboard focus, normal button semantics and descriptive form labels are required.

Selection reveals the corresponding evidence without hiding failures. Expensive or destructive operations are outside this read-only first release. Reconnection is automatic; stale/disconnected state remains visible.

## Truthful telemetry

Real GGUF, fake harness checks, running tasks and completed experiments are visibly distinct. No synthetic demo data is inserted into a live session. Missing measurements render as unavailable. A live elapsed clock is never reported as a completed task latency.

Acceptance is based on the host evaluator. All-task completion charts retain the assigned denominator. Point estimates do not become statistical claims. A successful network connection is not evidence that a model is running. Host memory labels distinguish Node from the model process.

## Initial screens

1. Empty observatory: clear setup instruction, no placeholder scores.
2. Live run: current task, elapsed clock, recent actual tool events and completion count.
3. Experiment: paired baseline/candidate outcomes, acceptance, completion curve and limits.
4. Evidence inspector: action trace, error, evaluator checks, final file contents and hashes.
5. Provenance: model/profile, source hashes, hardware and measurement conditions.

## Visual verification

CI checks the browser console, real DOM rendering, responsive overflow, safe untrusted text and screenshots at desktop/mobile sizes. Screenshots from fake plumbing runs must retain their simulation label. Manual visual review complements these checks; no claim of pixel perfection follows from a passing unit suite.
