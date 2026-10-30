from httpx import AsyncClient


async def test_healthz_ok(client: AsyncClient) -> None:
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


async def test_readyz_ok(client: AsyncClient) -> None:
    resp = await client.get("/readyz")
    assert resp.status_code == 200


async def test_request_id_generated(client: AsyncClient) -> None:
    resp = await client.get("/healthz")
    assert len(resp.headers["x-request-id"]) == 32


async def test_valid_request_id_is_echoed(client: AsyncClient) -> None:
    resp = await client.get("/healthz", headers={"X-Request-Id": "abc-123"})
    assert resp.headers["x-request-id"] == "abc-123"


async def test_unsafe_request_id_is_replaced(client: AsyncClient) -> None:
    resp = await client.get("/healthz", headers={"X-Request-Id": "bad id\nwith newline"})
    assert resp.headers["x-request-id"] != "bad id\nwith newline"
