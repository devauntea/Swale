# Selected-context assistant, mascot and briefings

This document describes the finalization candidate's implemented contract. It is
not a claim that a provider, a language, audible output, browser choreography or a
published release has passed acceptance. The tested revision and actual outcomes
belong in [FINAL_RELEASE.md](FINAL_RELEASE.md) and
[frontend/VERIFICATION.md](../frontend/VERIFICATION.md). The earlier crew briefing
API remains independent and compatible; its basin-ranking maintenance text is
not substituted for a public station explanation.

## One selected context

The existing assistant has a contextual backend presentation in Backend mode and
retains its separate, explicitly DEMO fixture history in Fixture mode. It is not a
second chat application. One canonical request carries the full subject identity,
overview/exploration scope, Normal/Flood mode, UI state version and optional local
station snapshot. The backend resolves the subject and source relationships;
names or nearby coordinates are never identity joins.

Automatic provider-disabled templates replace one current-selection explanation;
they do not append repeated entries to the conversation. Explicit Send and
Generate requests retain their conversation history and earlier-context labels.

| Subject | Identity and validation |
| --- | --- |
| Station | Full `subway_station:<GTFS stop ID>`; backend inventory or exact static model catalog entry. Static-only coverage is disclosed and does not acquire another station's live board. |
| Backend entrance | Full `subway_entrance:<source key>`; stored station relationship must match the supplied station. |
| Modeled source entrance | `model_entrance:<source row ID>`; entrance catalog must say matched and its exact GTFS station must exist in the model catalog. Unsupported/unmatched relationships fail closed. |
| Basin | Full `catch_basin:<source key>`; inventory existence establishes a location, not its condition. |
| Incident | Full `incident:<source key>`; dated report, verification finding and inferred basin association retain their separate meanings. |

Responses echo the canonical request and add `subject` geometry/station identity,
source evidence, coverage/limitations, source and fetch clocks, content version,
language and a server `context_key`. That key hashes canonical source evidence as
well as request context. The frontend checks the echoed identity, state version,
view modes and snapshot before accepting responses or applying actions. Unknown
source times remain unknown. Loading an asset, requesting a briefing or creating
audio never advances a source timestamp.

For stations, the public evidence pack can include inventory identity, a matching
stored monitoring sample, schematic model limitations and the current view's
meaning. A stored status is explicitly dated, not an official open/closed or
dry/safe finding. Missing operational coverage remains unknown. Incident packs
keep public reports, dated agency findings and inferred proximity links distinct;
case closure never proves cleaning. This context service does not silently query
unrelated nearby rankings, crew instructions or arbitrary external URLs.

A modeled source entrance retains its catalog S3/S4 vintages and unknown fetch
clock. When its exact GTFS parent station exists in the backend inventory, a
separate `#parent-station-monitoring` evidence item may carry that station's dated
sample. It is explicitly not an observation of entrance condition or availability.
Another station or a directional stop alias cannot supply this evidence.

## Local simulation snapshot

`snapshot` carries station/entrance IDs, `scenario_id`,
`model_version: "swale-entrance-storage-v1"`, elapsed seconds, fingerprint, bounded
numeric inputs and results. The model's supported five inputs and bounds are:

| Input | Bounds and unit |
| --- | --- |
| `streetDepthM` | 0–2 m prescribed street ponding |
| `barrierHeightM` | 0–2 m assumed threshold |
| `inflowCapacityLps` | 0–100 L/s assumed inflow capacity |
| `drainageCapacityLps` | 0–100 L/s assumed removal capacity |
| `durationS` | 1–1,800 s; elapsed time cannot exceed duration |

The backend validates identity, model version, field bounds and time consistency.
It does **not** certify browser-supplied result values or rerun the hydraulic
calculation. Those values are labelled unverified hypothetical client inputs and
results, never measured interior water or a backend simulation run. Numeric result
keys retain their units; unsupported unit semantics are disclosed. A local
`scenario_id` is never sent as the older simulation API's `run_id`.

Normal view hides hypothetical water while preserving the scenario; it cannot
establish that a station is dry, safe, open or accessible. Flood simulation is an
uncalibrated hypothetical visualization. Local station storage and regional
surface flooding are not scientifically coupled. The paused Carroll Street
600-second case remains a demonstration/regression case, not an observation.
The assistant binds to a paused snapshot rather than regenerating text on each
playback frame. Seek, reset, input/identity or mode changes invalidate incompatible
responses and narration.

## Grounded model and actions

The English explanation model selects IDs from server-prepared evidence
sentences. The server constructs the transcript from those sentences and appends
the complete planning warning; it does not accept model-invented factual prose,
coordinates, measurements, SQL, shell commands or unrestricted tools. A disabled,
failed or rejected model yields `source: "template"`, an explicit reason, and no
model actions. That fallback is useful but does not prove genuine AI operation.
Known server controls have distinct public explanations: disabled model execution
and an exhausted approved model allowance are identified before constructing a
provider client. Provider errors and rejected generated content retain generic
sanitized messages; no provider exception body is exposed.

Actions use a strict discriminated schema and a maximum of four entries:

| Action | Additional guard |
| --- | --- |
| `select_station` | Server model catalog plus explicit requested station; frontend loaded-inventory allowlist. |
| `set_view` | `overview` or `station_exploration`; supported station model required for exploration. |
| `set_water_view` | `normal` or `flood_simulation`; station context required. |
| `seek_simulation` | Existing selected local snapshot; explicit requested time, 0–1,800 s and within the active duration. |
| `set_layers` | Only boolean `basins`, `complaints`, `floodZones`, `buildings`; active-view restrictions still apply. |
| `highlight` | At most 20 server-validated subject/linked station IDs; frontend applies its narrower loaded-record rules. |
| `fly_to` | Validated current subject or associated station; no arbitrary coordinates. |
| `play_briefing`, `stop_audio` | Explicit user audio intent; playback also requires matching current context and transcript language. |

User-prompt intent checks operate on the user request, not retrieved text. Negated
requests and unsupported arguments fail closed. The frontend revalidates IDs,
modeled availability and scenario bounds, prevalidates related navigation actions
as a batch, and shows rejected actions as errors. A model response cannot authorize
real-world reports, dispatches, maintenance, administrative writes or provider
spending. Cached same-context requests do not replay travel or repeat generation.
The server checks the requested destination/visibility direction as well as the
action family; an exploration request cannot authorize the opposite overview
transition, or Normal authorize hypothetical water. Layer targets and their
show/hide direction must be requested. Seek cannot exceed the selected duration.

## Mascot and camera lifecycle

The local Swale SVG remains an original simplified interpretation of the supplied
blue robot, dark faceplate, white eyes, yellow raincoat and blue umbrella. An
illustrated hand is separate from the pointer. One projected overlay contains the
active mascot and its attached hand; the launcher keeps a home affordance and the
assistant header uses an icon rather than a duplicate character.

The finite sequence is `reaching → gripping → lifting → carrying → aligning →
lowering → releasing → settling → explaining`, nominally 1.97 seconds. Hand and
mascot share the transport frame while gripping. Release waits for the latest
visible target and a settled shared-map camera. A new selection cancels the old
sequence and starts at the currently rendered position. Same-target updates only
update the anchor. Manual map input stops travel for that selection. Offscreen or
invalid anchors use a labelled docked explanation. Resize and camera projection
updates do not create another character or map.

The anchor starts at the selected feature's actual `map.project` result with its
existing 65px upward screen offset. If the full artwork would intersect visible
controls, `visibleMascotAnchor` tests the original point, then 96px screen offsets
right, left, up, down and diagonally (at most 136px from that point). It reserves
70px left, 48px right, 88px above and 60px below the character center, including
the attached hand and raised alignment, with 8px clearance from UI and viewport
edges. Actual visible panel rectangles determine occlusion; panel resize and
class/hidden/child changes schedule a coalesced reprojection. No geographic
coordinates or camera settings change. An offscreen feature or lack of a clear
nearby candidate docks the explanation. Pure bounds and mocked-map lifecycle
tests cover this policy; browser clipping acceptance remains separate evidence.

The illustrated grip uses a small blue carry loop beside the hood/backpack and
rotates about the thumb/index pinch point. An initial browser recording found the
hand too low beside the torso/feet; the revised anchor/art was recorded in the actual browser (64 frames, all nine phases and one mascot), with a clear hood-side grip. Panel-aware placement and stale-projection holding are additionally tested; final source evidence is in FINAL_RELEASE.md. Retain that failed appearance evidence rather than relabelling the
earlier lifecycle capture as an attachment pass.

Tour camera requests come from the pure `modelTourCamera` helper and reference
actual selected entrance, flight, landing or available local-platform components.
The constrained views face into the first flight's local forward direction,
use 62–68-degree pitch at zoom21.8–22 and keep source XY unchanged. These are close
oblique model views, not an asserted1.6m surveyed eye-height or free walkthrough.
The local platform control is omitted where that component is absent. Basemap
building extrusions are hidden while exploring so unrelated walls cannot obscure
the selected schematic; the user's building preference remains intact and returns
in overview. Pure helper and workspace tests check targets, bounds, unsupported
component failure and preference restoration. They do not establish a rendered
tour pass; the earlier gray-wall capture and fresh browser verification remain
separate evidence.

Mascot movement and automatic camera travel have separate persisted controls.
Reduced motion removes decorative carry while retaining static pointing/context,
controls, transcripts and keyboard functionality. Actual playback state drives a
restrained speaking pose. RequestAnimationFrame callbacks, media listeners,
network requests and playback resources are cleaned up. These implementation and
isolated-test properties do not replace observation of clipping, attachment,
camera coordination or animation smoothness in a real browser.

## Translation, voices and playback

Configured languages are English (`en`), Spanish (`es`), Simplified Chinese (`zh`),
Arabic (`ar`), Russian (`ru`) and French (`fr`). Configured is distinct from
currently available, live-tested, audibly delivered and human-reviewed.
`/context/capabilities` reports conditional provider availability and remaining
allowance; every translation response retains `verified: false`. No human review
is claimed. Arabic transcript layout uses RTL; the workspace controls remain
English, so briefing translation is not advertised as full UI localization.

Machine translation operates on the selected English sentences, preserving their
order/count, identifiers, names/routes, numeric sequences and recognized physical
units. Conservative per-language checks reject dropped negative, unknown,
unverified/uncalibrated, hypothetical and inferred qualifiers. A complete
language-specific warning is appended independently. These checks can reject
valid translations and cannot prove semantic fidelity. Original English and
official source text remain accessible. A translation failure does not relabel
English as another language or silently speak it with a foreign voice.
Numeric comparison includes literal signs and scientific exponents; for example,
`-1.7919e-13` cannot become a positive value or an exponent of `+13`.

The transcript limit is 4,000 characters; an oversized transcript is rejected
without truncating a final warning. Translation creates a new immutable briefing
ID with the same source context key and no inherited navigation actions. Backend
audio preparation and delivery use that language-specific ID.

The default audio option is the existing remote ElevenLabs multilingual service
with its fixed backend voice (Matilda), model `eleven_multilingual_v2`. It has no
automatic alternate voice or paid retry. The optional browser voice path
dynamically calls `speechSynthesis.getVoices()` and listens for `voiceschanged`;
only voices whose language matches the validated transcript are offered. Each
option identifies `localService` as local-device or remote-browser service.
Choosing a remote browser voice means the browser's speech service may receive
the transcript. Voice inventory alone proves neither translation nor audible
delivery. An empty or unsupported inventory is shown honestly.

Play/Replay and a matching explicit typed “Play this briefing” request initiate
audio; selection, panel opening and translation completion never autoplay.
Pause/resume uses the selected playback engine where supported. Stop, selection,
locale/voice/evidence/mode/snapshot changes, closing and unmount cancel obsolete
playback. A single owner manages backend HTMLAudio and optional browser speech.
Browser speech segments the complete transcript rather than slicing it; resource
and callback generations prevent late narration of an old selection. Backend
audio blobs use revocable object URLs. Errors preserve the readable transcript.

The implementation follows the platform distinctions documented by MDN:
[voice discovery](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices),
[voice-list changes](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event),
[local and remote voices](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService),
and [user-initiated media playback](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).
Actual audible output, provider language quality, pause/resume reliability and
transcript agreement require the release's live acceptance evidence.

## Context feature-to-endpoint matrix

All paths below are relative to `/api/v1`. Requests carry no arbitrary URL. The
frontend dev and production-preview proxy permit exactly these contextual paths,
methods and no query parameters; unrelated legacy/admin mutations stay blocked.

| Capability | Request | Ownership / effect |
| --- | --- | --- |
| Provider/language readiness | `GET /context/capabilities` | Read provider opt-ins, attempt caps, reservation budget, language availability and cache limits. No provider generation. |
| Automatic selection explanation | `POST /context/briefings` with `use_model:false`, `language:"en"` | Debounced server evidence template; no model or speech call. |
| Selected briefing | `POST /context/briefings` | Explicit Generate; optional bounded model sentence selection and requested translation. |
| User agent request | `POST /context/agent` | Explicit Send plus prompt; source evidence and guarded reversible UI actions. |
| Existing transcript | `GET /context/briefings/{id}` | Read bounded process-local record; expired/missing IDs return 404. |
| Translate transcript | `POST /context/briefings/{id}/translations` | Explicit language request; model opt-in required for non-English; new immutable ID. |
| Prepare backend speech | `POST /context/briefings/{id}/audio` with `user_intent:true` | Explicit Play; provider allowance reserved before one generation; cache prevents duplicate charge for the retained record. |
| Deliver backend audio | `GET /context/briefings/{id}/audio` | `audio/mpeg`, private/no-store; 404 before preparation or after expiration. |
| Device/browser speech | No backend endpoint | Explicit selected matching voice; browser API ownership, complete segmented transcript. |

The server context cache is process-local: 64 records, 1,800-second TTL and a
16 MiB aggregate audio bound; individual provider audio is bounded to 2 MiB.
The frontend retains at most 30 messages and 12 cached replies, rejects oversized
JSON/audio, and has a 90-second request timeout. There is no automatic retry of
ambiguous billable requests. Restarting loses process-local transcripts/audio,
not the persistent provider reservation ledger. No contextual DB migration,
ingestion or database write is required.

## Provider and runtime controls

Credential presence does not authorize execution. Model/audio default off and
paid allowance defaults to zero. Server controls are
`SWALE_CONTEXT_MODEL_ENABLED`, `SWALE_CONTEXT_AUDIO_ENABLED`,
`SWALE_CONTEXT_MAX_MODEL_CALLS`, `SWALE_CONTEXT_MAX_AUDIO_CALLS`,
`SWALE_CONTEXT_BUDGET_USD` and `SWALE_CONTEXT_LEDGER_PATH`. The bounded release
launcher enables these only through explicit `--provider-budget-usd` and an
optional private `--credentials` file; it never prints credential values.
The finalization allowance is at most US$1, three model attempts and one audio
attempt. The fixed reviewed model comes from `swale.ai.briefing.DEFAULT_MODEL`;
an override to another model is rejected by this contextual path.

Before network execution, the private ledger atomically reserves US$0.20 per
model attempt or US$0.16 per 1,000 speech characters. These are conservative
execution reservations, not a claim of measured billing. Failed/uncertain
attempts consume their reservation. Translation is a model attempt; directly
creating a non-English model briefing can require both sentence selection and
translation. Existing English → explicit Translate avoids repeating selection.

The ledger resides outside the checkout in an owner-only mode0700 directory,
with an owner-only mode0600 regular single-link file. Symlinks/unsafe metadata
fail closed. Advisory locking, reload under lock, atomic replacement and fsync
preserve the allowance across service restarts/processes. Do not delete the
ledger to obtain another allowance. Existing DB ownership and rollback remain
the release operator's responsibility; this feature does not copy or reset it.
Readiness requests reload these counters under the same process lock as provider
reservations. They cannot overwrite increments awaiting atomic ledger persistence.

Only the chosen backend receives allowlisted provider credentials. The bounded
runtime keeps loopback routing, approved egress destinations, disabled alert
monitoring/tracing and a 128 KiB/10-second contextual request-body guard. Its
`check` action is static preflight, not backend-readiness or provider proof.
Read [release runtime source](../scripts/local/release_runtime.py),
[API contract](api/v1.md) and the actual release runbook before starting services.

## Verification boundary

Focused automated suites cover schema/identity drift, unknown actions/URLs,
response limits, cancellation/late results, atomic batch handoff, template versus
model calls, no autoplay, voice/transcript matching, complete speech segmentation,
audio lifecycle, projected-target arrival, retargeting, manual interruption and
reduced motion. Backend tests cover subject grounding, source-injection intent
guards, translation checks, audio intent/cache bounds and persistent reservations.
Mocks and fake clocks are software checks, not genuine model, audible-output,
visual choreography or publication evidence. Keep those outcomes separate in the
release acceptance record.

## Backend acceptance checkpoint — October 16, 2026

Final backend source is `f42005de7cf4201306dc67cdbba85cde2ef5615c`, running under controller61307/API61311/broker61310. The final critical receipt verifies full-ID details, selected-context create/get and the exhausted-allowance message, with the same persistent ledger. Earlier genuine model/Spanish/audio observations below remain identified as pre-restart evidence; they were not regenerated after the capped allocation. Publication status belongs to FINAL_RELEASE.md.

| Check | Status and evidence |
| --- | --- |
| Deterministic backend regression | PASS: 286 tests, five live tests deselected, nine existing TestClient deprecation warnings, 9.68 s after all backend fixes, including signed/exponent translation integrity and distinct disabled/exhausted public messages. Synthetic-ledger regressions prove disabled and exhausted paths do not construct a provider client or change reservations. Full log: `/tmp/swale-final-backend-control-error-tests.txt`. No test assertion was weakened. |
| Genuine English agent/action path | PASS for the observed implementation: captured HTTP 200 `source:"model"` response `37916f05bf734cb1904bffb72c871054` chose `select_station:subway_station:F21`, station exploration and Normal view. The explanation remains tied to its original Bergen entrance context; it is not relabelled as a Carroll briefing. [Captured responses](../frontend/verification-artifacts/final-release/context-response-bodies.json). |
| Genuine selected Carroll explanation | PASS for the observed implementation: HTTP 201 `source:"model"`, English briefing `f3835c82149343c88bd964c46ebbe91e`, selected Carroll entrance with exact parent-station evidence and no actions. Same captured-response artifact. |
| Spanish machine translation | PASS for observed delivery and structural evidence: the translation endpoint returned HTTP 201 and the UI displayed a Spanish machine translation of the retained 600-second snapshot, with Carroll/route/subject identities, numeric values/units and the complete Spanish planning warning. [Network capture](../frontend/verification-artifacts/final-release/audio-network.json), [rendered transcript and original-English control](../frontend/verification-artifacts/final-release/spanish-result-state.txt). This is not human language review or proof of general semantic fidelity. |
| Backend speech and playback | PASS for provider generation, full1,356-character transcript,1,565,300 audio/mpeg bytes and actual English provider-MPEG UI playing/pause/resume/stop/replay. The private provider-audio-receipt.json and english-audio-play-result.txt retain the outcomes. Human listening/auditory agreement was not performed. |
| Spanish playback state | PASS for explicit local Mónica es-ES selection and actual playing/pause/resume/stop/replay states; language change stopped playback. See spanish-audio-playing-state.txt and spanish-briefing.jpg. Human listening and translation review were not performed. |
| Other configured languages | NOT_RUN for live translation/audio and human review: Chinese, Arabic, Russian and French remain configured, not accepted language capabilities. |
| Updated safety guards in the live runtime | PASS: committed f42005d started with unchanged ledger and successful release-critical-readiness.json checks, including explicit exhausted-allowance fallback without a provider attempt. Genuine model/speech success remains prior observed evidence; no paid allocation was reset. |

The operator reported three model attempts in total (two English model responses
and Spanish translation) and one speech attempt. Exact reservations and remaining
allowance must come from the preserved ledger, not these request counts or token
estimates. No ledger reset, extra paid retry or new allowance is implied. The
bounded finalization allowance is not an authorization for continuing production
AI/audio use after the verification allocation is consumed.
