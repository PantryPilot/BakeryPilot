def test_list_pallets_returns_200(client):
    r = client.get("/api/pallets")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_pallets_non_empty(client):
    r = client.get("/api/pallets")
    assert len(r.json()) > 0


def test_list_stranded_pallets(client):
    r = client.get("/api/pallets/stranded")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_pallet_has_required_fields(client):
    r = client.get("/api/pallets")
    pallet = r.json()[0]
    assert "pallet_id" in pallet
    assert "sku_id" in pallet
    assert "status" in pallet


def test_route_pallet_not_found(client):
    r = client.post("/api/pallets/nonexistent_pallet/route", json={"action": "reroute"})
    assert r.status_code == 404
