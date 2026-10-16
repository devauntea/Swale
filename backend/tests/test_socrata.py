import httpx
import pytest

from swale.sources.socrata import SocrataClient, SocrataError


def client_for(handler):
    sleeps: list[float] = []
    return SocrataClient(transport=httpx.MockTransport(handler), sleep=sleeps.append), sleeps


def test_rows_pages_until_a_short_page():
    offsets = []

    def handler(request):
        offset = int(request.url.params["$offset"])
        offsets.append(offset)
        size = 2 if offset < 4 else 1
        return httpx.Response(200, json=[{"n": offset + i} for i in range(size)])

    client, _ = client_for(handler)
    assert [r["n"] for r in client.rows("abcd-1234", page_size=2)] == [0, 1, 2, 3, 4]
    assert offsets == [0, 2, 4]
    assert len(client.requests) == 3


def test_rows_sends_soql_parameters_and_user_agent():
    seen = {}

    def handler(request):
        seen.update(request.url.params)
        seen["ua"] = request.headers["User-Agent"]
        return httpx.Response(200, json=[])

    client, _ = client_for(handler)
    list(client.rows("abcd-1234", where="borough = 'BROOKLYN'", select="unique_key"))
    assert seen["$where"] == "borough = 'BROOKLYN'"
    assert seen["$select"] == "unique_key"
    assert seen["$order"] == ":id"
    assert seen["ua"].startswith("Swale-hackathon/")


def test_retries_503_with_exponential_backoff_then_succeeds():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(503) if len(calls) < 3 else httpx.Response(200, json={"name": "ok"})

    client, sleeps = client_for(handler)
    assert client.metadata("abcd-1234") == {"name": "ok"}
    assert sleeps == [2.0, 4.0]


def test_gives_up_after_max_attempts():
    client, sleeps = client_for(lambda request: httpx.Response(503))
    with pytest.raises(SocrataError, match="gave up"):
        client.metadata("abcd-1234")
    assert len(sleeps) == client.max_attempts - 1


def test_does_not_retry_client_errors():
    calls = []

    def handler(request):
        calls.append(1)
        return httpx.Response(400, text="bad query")

    client, sleeps = client_for(handler)
    with pytest.raises(SocrataError, match="HTTP 400"):
        client.metadata("abcd-1234")
    assert calls == [1]
    assert sleeps == []


def test_retries_transport_errors():
    calls = []

    def handler(request):
        calls.append(1)
        if len(calls) == 1:
            raise httpx.ConnectError("connection refused", request=request)
        return httpx.Response(200, json=[])

    client, sleeps = client_for(handler)
    assert list(client.rows("abcd-1234")) == []
    assert sleeps == [2.0]
