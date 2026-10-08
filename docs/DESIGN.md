# Kovan: a place to observe useful work

The name evokes a hive: small contributions becoming something useful together.
The interface should feel calm enough to leave open while thinking, with evidence always close to the result. Warmth comes from color and type; confidence comes from truthful states.

## Palette

| Role | Token | Color |
| --- | --- | --- |
| Main background | ink | #171b19 |
| Reading text | parchment | #eee9df |
| Accepted / connected | jade | #a7c7b0 |
| Failure / attention | copper | #c99774 |
| Secondary text | quiet | #aaafa5 |
| Surface | panel | #1c211e |
| Raised surface | panel-raised | #222823 |
| Divider | line | #363d35 |

Status also has a written label; color carries no meaning by itself.
The connected dot describes the telemetry connection, not active inference.

## Typography and layout

Georgia supplies the large title and section headings. Native system sans handles instructions and controls. SF Mono, Consolas or Liberation Mono handles timings, file text and evidence. The app fetches no fonts or analytics.

The page moves from session identity to measured outcomes, then comparisons and machine conditions, then individual tasks and evidence. One-arm controls show one-arm metrics. On smaller screens, comparisons and inspectors stack without hiding failed outcomes.

The live clock is elapsed wall time. Accepted-result timing is reported only after the private audit. Missing measurements remain unavailable; fake checks carry an explicit label. A selected task keeps its tool history and file contents visible.

## Interaction and accessibility

Keep keyboard focus visible, preserve the skip link, use semantic controls, and respect reduced-motion preferences. Avoid decorative animation while inference runs. The read-only GUI renders untrusted model/file text as text, never HTML.

The implementation tokens live in public/app.css. Browser checks cover live updates, desktop/mobile layout, incomplete results, safe file rendering and an actual recorded model report. Screenshots represent the data used to capture them, not a performance claim.
