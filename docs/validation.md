# Does the ranking predict real problems? (temporal holdout)

Run on 2026-10-16 against the BK0601 snapshot (fetched 2026-10-16) with `GET /api/v1/risk-rankings/validation`.

**Method.** Rank all 2,092 basins in the BK0601 bounding box *as of a cutoff date*, using only evidence dated before it (DEP findings, 311 reports, FloodNet floods). Then look at the next 365 days for real outcomes at each basin:
- a DEP resolution recording an obstruction;
- a flood-related 311 report linked to the basin;
- a non-tidal FloodNet sensor within 500 ft measuring a flood.

The simulation factor is left out because its results have no date and would leak. A test checks that no evidence dated after the cutoff contributes.

## Cutoff 2025-10-01 (outcomes 2025-10-01 to 2026-10-01)

259 basins had evidence at the cutoff. Base rate (any outcome, all basins): **15.0%**.

| Top N | Any outcome | DEP obstruction | Flood report | Measured flood | Lift vs base |
|---|---|---|---|---|---|
| 10 | 40% | 10% | 40% | 0% | **2.7×** |
| 25 | 36% | 16% | 32% | 8% | **2.4×** |
| 50 | 48% | 10% | 20% | 32% | **3.2×** |
| 100 | 54% | 11% | 19% | 38% | **3.6×** |

## Cutoff 2025-04-01 (outcomes 2025-04-01 to 2026-04-01)

306 basins had evidence. Base rate: **10.6%**.

| Top N | Any outcome | Lift vs base |
|---|---|---|
| 10 | 50% | **4.7×** |
| 25 | 52% | **4.9×** |
| 50 | 74% | **7.0×** |
| 100 | 64% | **6.0×** |

## How to read this

- **What it shows:** basins the method ranks highly are 2.4–7× more likely than average to have a real problem the following year.
- **Persistence:** much of the signal is that problems recur at the same places, especially measured floods near sensors that flooded before. That's useful for maintenance planning, but it isn't a discovery of new hotspots.
- **Small samples:** top 10 is 10 basins, so treat the exact percentages as indicative.
- **Outcomes are imperfect labels:** a flood report is still a report, and FloodNet covers only the places it has sensors.
