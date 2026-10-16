"""Apply Swale's schema. Safe to run on every start."""

from pathlib import Path
from typing import Any

from swale.db.connection import run

SCHEMA_FILE = Path(__file__).with_name("schema.surql")


def apply_schema(db: Any) -> None:
    run(db, SCHEMA_FILE.read_text())
