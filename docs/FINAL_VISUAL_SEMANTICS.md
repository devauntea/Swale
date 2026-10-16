# Final route and hazard semantics — October 16, 2026

Service identity is centralized in `frontend/src/map/servicePalette.ts`, shared by labelled UI badges, map station badges and explicit source-associated schematic route paths. The primary source was verified on 2026-10-16: [MTA developer resources](https://www.mta.info/developers), which links the [official NY Open Data line-color dataset 3uhz-sej2](https://data.ny.gov/resource/3uhz-sej2.json). Verification date is not a claimed dataset update timestamp; source update time is unknown. This is STATIC service identity, not a demonstration risk result or evidence of current operating service.

| Services | Official digital fill |
| --- | --- |
| A C E | `#0062CF` |
| B D F M | `#EB6800` |
| G | `#799534` |
| J Z | `#8E5C33` |
| L S | `#7C858C` |
| N Q R W | `#F6BC26` |
| 1 2 3 | `#D82233` |
| 4 5 6 | `#009952` |
| 7 | `#9A38A1` |

Explicit GTFS aliases FS/GS/H use shuttle S color; 6X/7X/FX use 6/7/F color. Supplied labels remain visible. Unknown identifiers retain their text and a neutral fallback without invented service identity. Yellow route badges use dark lettering. Route fills remain unchanged by theme, selection, alert status or water view; selection uses separate outlines/width. Multi-service badges retain every supplied service. Native station-picker option text remains plain text with the selected station's badges alongside it. Schematic route fills use only actual `S2:route=…` source associations; no topology or source path is changed. Co-located services use nested stroke widths so their official fills can remain distinguishable.

Hazards are rendered from validated backend features by `frontend/src/map/backendHazardLayers.ts`; development fixtures remain separately labelled DEMO. Every icon stays at an actual source member's point. Inventory is neutral with a grate icon and **condition unknown**; being an observed inventory record does not establish an observed obstruction. Pothole reports use a separate cracked-road outline and never imply traffic impact.

Red halo emphasis requires the exact clogged-catch-basin or pothole category, an explicit unresolved source status, an uncontradicted report state, a report timestamp within 24 hours, a source fetch within 24 hours, and neither collection nor source flagged stale. The 24-hour window is an interface emphasis policy, not a validated incident lifetime or proof of current condition. Missing, future, stale or uncertain clocks/status fail static. Active reports remain labelled unverified. Agency field findings retain their actual dated verification and stay static; closed/resolved/historical records remain static, and administrative closure never establishes cleaning. Unknown condition remains unknown. Nearby basin relationships retain their inferred meaning.

The grate/cracked-road icon remains continuously visible. Eligible halos vary gently in radius/low opacity over 1.8 seconds, without switching the icon off. At most 12 spatially separated records pulse at once; selection takes priority. Below zoom18, density grouping uses approximately90px map-plane cells, actual source representative points, and record counts with a zoom-in explanation. Selected records remain separately inspectable and counts still sum to the number of valid source features. Cluster icons are24px; ordinary inventory/report icons are14/22px. These settings were tightened after actual pitched-overview clutter was observed; the new appearance still requires browser reobservation. Grouping makes no combined condition claim. Historical/static shapes, borders and text preserve meaning independently of color.

The visible hazard-animation control persists its pause preference. Reduced-motion and hidden-document states stop the single bounded 100 ms animation clock, and unmount/pause releases it. Static report indicators remain identifiable. The authored pulse is approximately 0.56 cycles/second; default scene appearance still requires browser observation, rather than inferring [flashing-threshold](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html) or [pause-control](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) acceptance solely from source. No formal WCAG certification is claimed.

Light mode's sidebar receives scoped cool-white/pale-blue surfaces, navy text and blue controls; dark mode retains its established tokens. Existing meaningful palette assertions remain, with only exact official MTA yellow/orange/green literals permitted in the centralized service palette. Source tests cover identity, status/freshness gating, selection, density, pulse limits, motion cleanup/persistence and source-derived route colors. They do not substitute for actual map visual, overlap, focus or performance acceptance. Component labels use the selected entrance model's actual component IDs, labels and positions; they describe virtual model parts and provide no real-world walking/evacuation instruction.
