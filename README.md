# Swale

Swale flags Brooklyn streets at risk of flooding from clogged catch basins. It combines NYC DEP's catch-basin inventory, 311 reports with DEP's own inspection findings, FloodNet flood sensors and EPA SWMM rainfall simulations, then ranks basins for inspection with the evidence behind each ranking. Every record says whether it is observed, reported, predicted or inferred.

- Backend (API, SurrealDB, data pipelines): [backend/README.md](backend/README.md)
- Frontend API contract: [docs/api/v1.md](docs/api/v1.md)
- Data sources and their limits: [docs/data-sources.md](docs/data-sources.md)
- Design: [docs/design/2026-10-15-swale-backend-design.md](docs/design/2026-10-15-swale-backend-design.md)

## Run the backend (no Docker needed)

```bash
cd backend
uv sync
uv run swale ingest --from-snapshot sample_data/bk0601
uv run swale serve
```

Then open http://127.0.0.1:8000/dev/map for the dev map, or http://127.0.0.1:8000/docs for the API.
