def test_list_pallets_returns_200(client):
    r = client.get("/api/pallets")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_stranded_pallets(client):
    r = client.get("/api/pallets/stranded")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_pallets_schema(client):
    pallets = client.get("/api/pallets").json()
    for p in pallets:
        assert "pallet_id" in p
        assert "sku_id" in p
        assert "status" in p


def test_route_pallet_not_found(client):
    r = client.post("/api/pallets/nonexistent_pallet/route", json={"action": "reroute"})
    assert r.status_code == 404
