# Guided tutorial local candidate — October 16, 2026

Implemented on `feat/guided-tutorial` in `/Users/kerwynjean/Swale-tutorial`.
Fetched base: `4ddb2b385755748787f0f92b7f152941960aec19` (origin/main matched the brief).
Final SHA: the local commit containing this record; exact full SHA is in the delivery report.
Preview: http://127.0.0.1:5193/ (isolated Vite server). No push, merge or deployment.
The recording environment was preserved: no existing server was stopped, restarted or edited.
First recorded implementation clock: 19:12:46 UTC / 3:12:46 PM EDT. Prior active duration is unmeasured.
Owner subsequently required delivery by 3:22 PM EDT; remaining acceptance limits are explicit below.

## Implementation

Ten steps cover welcome, map, layers, Normal/Flood, station exploration, station flood playback,
evidence, assistant, multilingual briefings, and theme/completion. Existing Swale SVG poses are reused;
the connected carry mascot is suspended during the tour so only one guide owns presentation.
Manual popover dialog, body portal, stable data-tutorial attributes, responsive measured positioning,
focus-to-heading and focus-to-control actions, Escape, safe fallback/retry, optional practice,
versioned local preferences, Resume/Restart and completion are included without a dependency.

Show Me uses existing local water controls, panels, fixture selection, station entry and 600-second
snapshot. It never switches data connections automatically. Fixture mode explains how to reach
Subway monitoring; unavailable station/briefing targets show a retry/skip explanation. Provider
requests, automatic context requests and audio are guarded during the tour. Local tutorial example
text does not masquerade as an AI response. Real briefing controls remain the existing component.

Cancellation restores saved layers/scenario/fixture selection, station selection, presentation panels,
water view and captured camera where available. Explicit user data-mode and theme choices remain.
Playback inputs/history are not rolled back across different entrance identities. Completion retains
explored state and does not replay the station auto-camera effect (regression covered).

## Evidence matrix

| Check | Result | Evidence / limit |
| --- | --- | --- |
| T1 Entry in overview and station | PASS | Actual Chrome overview and Carroll St exploration; entry remained visible. |
| T2 Dismiss invitation | PASS | Maybe Later left the map interactive without starting; automated regression. |
| T3 Anchors and recovery | PASS for observed targets | Browser map/layers/water/station/timeline/assistant/briefing/theme; unavailable fixture station fallback. Full all-state anchor combinations NOT_RUN. |
| T4 Lifecycle controls | PASS | Browser Next, Close, Escape, Resume after reload, Restart, Finish and retake; Back/Skip/Explore semantics covered by shared handler and tests. |
| T5 Real optional practice | PASS | Existing water toggle, real station catalog F21, Steps viewpoint and assistant panel; Next never requires practice. |
| T6 Hypothetical distinctions | PASS | Actual Normal/Flood comparison and 600 s/10,800 L existing local snapshot explicitly hypothetical. No new model or numeric results. |
| T7 Station components | PASS | Carroll St F21 source-linked entrance, Steps camera and existing component/viewpoint controls rendered. |
| T8 Mascot ownership | PASS for sampled use | Single tutorial mascot, carry hidden; greeting/pointing/explanation/completion poses; no duplicate guide observed. Exhaustive carry interruption testing NOT_RUN. |
| T9 No provider automation | PASS (focused tests/source review) | New test spies briefing/agent/audio across context and language changes during tour; provider actions disabled and guarded. Browser generated no AI/translation/audio intentionally. Comprehensive network audit NOT_RUN. |
| T10 Accessibility/mobile | PASS for observed checks; screen-reader audit NOT_RUN | Labelled nonmodal dialog, heading focus, Escape, focus return, no trap. Narrow measured viewport354px had scrollWidth354px; card within viewport. Reduced-motion matched true, computed mascot animations empty. VoiceOver/NVDA testing NOT_RUN. |
| T11 Themes | PASS | Actual light/dark toggles preserved step and station snapshot; dark preference survived reload. |
| T12 Persistence | PASS | Resume step2 after reload; dismissal/completion/version rejection/storage failure covered in focused tests. |
| T13 Regressions | PASS for automated suite and sampled browser | Existing 304 tests plus7 new tests; real model entry, water comparison and assistant controls exercised. Paid assistant/audio end-to-end NOT_RUN by scope. |
| T14 Checks | PASS | Strict TypeScript,311 tests in38 files, oxlint, complete Prettier check, Vite production build, git diff whitespace check. |

Screenshots: `light-welcome.jpg`, `dark-water.jpg`, `light-station.jpg`, `mobile-reduced-motion.jpg`.
Station/mobile captures preceded the final portal/cutout repair; final overview captures verify that repair.
Actual browser found and fixed invitation occlusion by the inspector, and completion replaying automatic
camera travel. Regression test locks completion camera/selection behavior.

One measured final-code Next click-to-heading DOM mutation: **9.4ms** (Chrome, warm development
preview; not paint/GPU latency). Opening latency, cold transferred bytes, basemap bytes and FPS
NOT_MEASURED. Temporary browser instrumentation and viewport/reduced-motion overrides were removed.
Console evidence includes a deck.gl missing middle-dot glyph during station labels (existing label
renderer), Grammarly extension messages, and a development HMR dependency-array warning while an
effect was edited. A subsequent full reload was used; this is not a universal resource-clean pass.
No sprite warnings were hidden or suppressed. Production runtime/browser full audit and recording
NOT_RUN within the deadline. This is a local demo candidate, not full production acceptance.

## Three-minute demo

1. Open the isolated preview and click How to Use Swale; show the mascot and spotlight.
2. Next to layers and Normal/Flood; use Show Me, switch theme, explain hypothetical status.
3. For station practice select Backend / snapshot + transit, Subway monitoring; Show Me opens
   the real explorer. Select Carroll St (F21), advance and Show Me opens600s. Use Steps viewpoint.
4. Open assistant with Show Me; show language selector and explicit provider pause, then Finish.

Changed files are frontend only: App, tutorial model/component/styles, stable anchors in existing
sidebar/map/station components, contextual assistant tutorial guards, three focused test files,
this record, screenshots and the additive frontend verification link. No packages or backend changed.
