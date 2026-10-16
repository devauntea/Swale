"""Minimal Socrata (NYC Open Data) client: paged SoQL reads, metadata, retries with backoff."""

from __future__ import annotations

import time
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from typing import Any

import httpx

DOMAIN = "https://data.cityofnewyork.us"
USER_AGENT = "Swale-hackathon/0.1 (+https://github.com/devauntea/Swale)"
RETRYABLE = frozenset({429, 500, 502, 503, 504})


class SocrataError(RuntimeError):
    pass


@dataclass
class SocrataClient:
    domain: str = DOMAIN
    app_token: str | None = None
    timeout_s: float = 120.0
    max_attempts: int = 5
    backoff_s: float = 2.0
    transport: httpx.BaseTransport | None = None
    sleep: Callable[[float], None] = time.sleep
    requests: list[str] = field(default_factory=list)  # every URL fetched successfully (ingest provenance)

    def __post_init__(self) -> None:
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        if self.app_token:
            headers["X-App-Token"] = self.app_token
        self._http = httpx.Client(base_url=self.domain, headers=headers, timeout=self.timeout_s, transport=self.transport)

    def close(self) -> None:
        self._http.close()

    def rows(
        self, dataset: str, *, where: str | None = None, select: str | None = None, order: str = ":id", page_size: int = 5000
    ) -> Iterator[dict[str, Any]]:
        """Yield every matching row, a page at a time, in a stable order."""
        offset = 0
        while True:
            params: dict[str, Any] = {"$limit": page_size, "$offset": offset, "$order": order}
            if where:
                params["$where"] = where
            if select:
                params["$select"] = select
            page = self._get(f"/resource/{dataset}.json", params)
            yield from page
            if len(page) < page_size:
                return
            offset += page_size

    def metadata(self, dataset: str) -> dict[str, Any]:
        return self._get(f"/api/views/{dataset}.json", {})

    def _get(self, path: str, params: dict[str, Any]) -> Any:
        last_error = ""
        for attempt in range(1, self.max_attempts + 1):
            try:
                response = self._http.get(path, params=params)
            except httpx.TransportError as exc:
                last_error = f"{type(exc).__name__}: {exc}"
            else:
                if response.status_code == 200:
                    self.requests.append(str(response.url))
                    return response.json()
                if response.status_code not in RETRYABLE:
                    raise SocrataError(f"HTTP {response.status_code} for {response.url}: {response.text[:300]}")
                last_error = f"HTTP {response.status_code}"
            if attempt < self.max_attempts:
                self.sleep(self.backoff_s * 2 ** (attempt - 1))
        raise SocrataError(f"gave up on {path} after {self.max_attempts} attempts ({last_error})")
