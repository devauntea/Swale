"""The `swale` command: ingest, snapshot, serve, bench-bbox."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from datetime import date
from pathlib import Path

from swale.config import BACKEND_DIR, Settings

SAMPLE_DIR = BACKEND_DIR / "sample_data"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="swale", description="Swale backend tools")
    sub = parser.add_subparsers(dest="command", required=True)
    ingest = sub.add_parser("ingest", help="load an area into the database, live or from a snapshot")
    ingest.add_argument("--area", default="BK0601")
    ingest.add_argument("--since", type=date.fromisoformat, default=date(2020, 1, 1))
    ingest.add_argument("--from-snapshot", type=Path, metavar="DIR")
    snapshot = sub.add_parser("snapshot", help="fetch an area live and write a snapshot bundle")
    snapshot.add_argument("--area", default="BK0601")
    snapshot.add_argument("--since", type=date.fromisoformat, default=date(2020, 1, 1))
    snapshot.add_argument("--out", type=Path)
    serve = sub.add_parser("serve", help="run the API")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8000)
    sub.add_parser("bench-bbox", help="SurrealDB bbox benchmark; arguments pass through", add_help=False)
    args, rest = parser.parse_known_args(argv)
    settings = Settings.from_env()

    if args.command == "bench-bbox":
        from swale.bench.bbox import main as bench_main

        return bench_main(rest)
    if rest:
        parser.error(f"unrecognized arguments: {' '.join(rest)}")
    if args.command == "serve":
        import uvicorn

        uvicorn.run("swale.api.app:create_app", factory=True, host=args.host, port=args.port)
        return 0

    from swale.ingest.bundle import fetch_bundle, read_bundle, write_bundle
    from swale.sources.socrata import SocrataClient

    def fetch():
        client = SocrataClient(app_token=settings.socrata_app_token)
        try:
            return fetch_bundle(client, args.area, since=args.since)
        finally:
            client.close()

    if args.command == "snapshot":
        bundle = fetch()
        out = args.out or SAMPLE_DIR / args.area.lower()
        write_bundle(bundle, out, compress=True)
        print(json.dumps({"wrote": str(out), "fetched_at": bundle.fetched_at.isoformat(), **{p.source.key: len(p.rows) for p in bundle.pulls()}}, indent=2))
        return 0

    from swale.core.timeutil import utcnow
    from swale.db.connection import connect
    from swale.ingest.pipeline import ingest_bundle

    bundle, mode = (read_bundle(args.from_snapshot), "snapshot") if args.from_snapshot else (fetch(), "live")
    with connect(settings.db_url) as db:
        summary = ingest_bundle(db, bundle, mode=mode, now=utcnow())
    print(json.dumps(asdict(summary), indent=2, default=str))
    return 0
