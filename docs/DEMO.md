# Swale demo script (about 5 minutes)

**Live site:** https://d1tl5jij0x3sdf.cloudfront.net (3D map) · **console:** `/dev/map` · **API docs:** `/docs`

Before presenting, run the smoke check (read-only, about 20 s):

```bash
cd backend && uv run python scripts/smoke.py https://d1tl5jij0x3sdf.cloudfront.net
```

## 1. The problem (30 s)
Brooklyn's catch basins clog; when heavy rain comes, streets and subway entrances flood. The city has the data to decide
which basins to clean first, but it is scattered across agencies. Swale joins it, and is honest about what is measured,
reported, predicted or inferred: every map layer and every claim carries that label.

## 2. The map (45 s) · 3D frontend, then the console
- 2,092 DEP catch basins, 311 reports, 17 FloodNet sensors, DEP's own flood map, 15 subway stations: all real NYC data.
- **SurrealDB** holds all of it, embedded in the API: geometry, graph links from complaints to basins, change feeds.

## 3. Live weather and the forecast check (45 s) · console, "Weather now"
- Live NWS observation and 24-hour forecast; the rain on the map follows the forecast.
- Click **Was the forecast right?**: the NWS forecast issued before each window, against NOAA MRMS radar and rain gauges.
  (Worth saying: the radar service claims inches, but its values are millimetres; we checked it against three gauges.)

## 4. Simulate, compare, decide (60 s) · "Simulate a storm"
- Pick DEP's 2.13 in/hr storm. **What if we clear them?**: clearing the basins DEP found clogged removes deep flooding at
  11 basins (265 to 254).
- **What if we add rain gardens?**: green infrastructure on 5% of each block takes it from 265 to 74 deep-flooding basins.
- **Sweep all storms (Daytona)**: 9 SWMM runs in parallel **Daytona** sandboxes in about 20 s (6 at once, 4.3x faster).
- Say it plainly: an uncalibrated schematic model; the direction is the point, not the exact numbers.

## 5. Where to inspect first, and voice entry (45 s) · "Where to inspect first"
- Ranking risk-v2: every score shows its factors and evidence. Validated on the past: 80% of the top 25 had a real problem the
  next year, against 15% for a random basin.
- Click a basin, hold **🎤 Hold to speak**: "debris found, leaves on the grate". **ElevenLabs Scribe** transcribes it; the
  inspection is saved and the ranking updates live in every open browser (SurrealDB change feed).

## 6. Rain alert pack (45 s) · "Rain alert pack"
- When NWS rain reaches watch or warning, Swale runs the forecast through the model, re-ranks, writes a crew briefing with
  **Claude on Amazon Bedrock**, translates it, and reads it aloud with **ElevenLabs**. The monitor checks every 10 minutes.
- Today is dry, so the last pack is a labelled drill. Play the Spanish and Chinese audio.

## 7. Subway (30 s) · "Subway"
- Live trains and delays from MTA feeds (delay = predicted minus scheduled). Station flood exposure at the entrances.
- **Step-free access under flood**: MTA elevator and escalator status joined with flood exposure.

## 8. Trust (30 s) · "Crew briefing" → **Briefing quality (Arize)**
- Every briefing is checked against its evidence before use; failures fall back to a template.
- **Arize**: traces for every briefing, and evaluations per prompt version, including a Claude judge for faithfulness.
  The judge found our stricter prompt v2 less faithful than v1 on a small sample, so v1 stays the default.

## If something fails
| Symptom | Say / do |
|---|---|
| Briefing says "template" | Bedrock is unreachable; the deterministic template is the safe fallback, by design. |
| A request takes long or returns 504 | CloudFront allows 60 s per request; retry, or show the stored alert pack. |
| HTTP 429 | The per-visitor limit on paid actions (20 per minute) is working; wait a few seconds. |
| Voice button does nothing | The browser blocked the microphone; use the result buttons instead. |
| Whole site down | Run locally: `cd backend && uv run swale serve`, then open http://127.0.0.1:8000/dev/map. |
