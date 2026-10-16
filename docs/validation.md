# Does the ranking predict real problems? (temporal holdout)

Run on 2026-10-16 against the BK0601 snapshot (fetched 2026-10-16) with `GET /api/v1/risk-rankings/validation`.

**Method.** Rank all 2,092 basins in the BK0601 bounding box *as of a cutoff date*, using only evidence dated before it (DEP findings, 311 reports, FloodNet floods, crew inspections). Then look at the next 365 days for real outcomes at each basin:
- a DEP resolution recording an obstruction;
- a flood-related 311 report linked to the basin;
- a non-tidal FloodNet sensor within 500 ft measuring a flood.

The simulation factor is left out because its results have no date and would leak. DEP's flood map is included: it is a model DEP last updated in 2024, before both cutoffs, so it carries no knowledge of the outcome years. No crew inspections exist in the real data yet, so that factor is missing for every basin. A test checks that no evidence dated after the cutoff contributes.

## Current method: risk-v2

risk-v2 adds DEP's Stormwater Flood Map (Moderate storm, current sea level) and crew inspections, and lowers the weight of Swale's own uncalibrated simulation from 0.25 to 0.10, because it agreed with DEP's map at only 55% of basins.

| Cutoff | Base rate (any outcome) | Top 10 | Top 25 | Top 50 | Top 100 |
|---|---|---|---|---|---|
| 2025-10-01 | 15.0% | 70% (**4.7×**) | 80% (**5.3×**) | 64% (**4.3×**) | 54% (**3.6×**) |
| 2025-04-01 | 10.6% | 80% (**7.5×**) | 92% (**8.7×**) | 84% (**7.9×**) | 62% (**5.8×**) |

Breakdown for cutoff 2025-10-01:

| Top N | DEP obstruction | Flood report | Measured flood |
|---|---|---|---|
| 10 | 20% | 40% | 40% |
| 25 | 12% | 32% | 60% |
| 50 | 6% | 16% | 54% |
| 100 | 7% | 13% | 48% |

## Previous method: risk-v1

### Cutoff 2025-10-01 (outcomes 2025-10-01 to 2026-10-01)

259 basins had evidence at the cutoff. Base rate (any outcome, all basins): **15.0%**.

| Top N | Any outcome | DEP obstruction | Flood report | Measured flood | Lift vs base |
|---|---|---|---|---|---|
| 10 | 40% | 10% | 40% | 0% | **2.7×** |
| 25 | 36% | 16% | 32% | 8% | **2.4×** |
| 50 | 48% | 10% | 20% | 32% | **3.2×** |
| 100 | 54% | 11% | 19% | 38% | **3.6×** |

### Cutoff 2025-04-01 (outcomes 2025-04-01 to 2026-04-01)

306 basins had evidence. Base rate: **10.6%**.

| Top N | Any outcome | Lift vs base |
|---|---|---|
| 10 | 50% | **4.7×** |
| 25 | 52% | **4.9×** |
| 50 | 74% | **7.0×** |
| 100 | 64% | **6.0×** |

## How to read this

- **What it shows:** under risk-v2, basins ranked in the top 25 are 5–9× more likely than average to have a real problem the following year (risk-v1: 2.4–5×).
- **Where the gain comes from:** mostly measured floods. DEP's map points at low-lying blocks where FloodNet later measured flooding. DEP-obstruction precision fell slightly, because obstruction history now carries 0.25 instead of 0.30.
- **Persistence:** much of the signal is that problems recur at the same places, especially measured floods near sensors that flooded before. That's useful for maintenance planning, but it isn't a discovery of new hotspots.
- **Tuned on the same area:** the weights were chosen by judgment, not fitted, but both cutoffs are in BK0601. A different district would be a fairer test.
- **Small samples:** top 10 is 10 basins, so treat the exact percentages as indicative.
- **Outcomes are imperfect labels:** a flood report is still a report, and FloodNet covers only the places it has sensors.
