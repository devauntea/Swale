"""Schema-drift checks against the real sources. Opt-in: uv run pytest -m live"""

import pytest

from swale.sources.registry import REGISTRY
from swale.sources.socrata import SocrataClient

pytestmark = pytest.mark.live


@pytest.mark.parametrize("key", sorted(REGISTRY))
def test_required_columns_still_exist(key):
    source = REGISTRY[key]
    client = SocrataClient(source.domain)
    try:
        meta = client.metadata(source.dataset)
    finally:
        client.close()
    columns = {c["fieldName"] for c in meta["columns"]}
    missing = set(source.required_columns) - columns
    assert not missing, f"{source.dataset} no longer has {sorted(missing)}"
