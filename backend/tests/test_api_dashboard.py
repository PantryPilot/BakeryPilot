def test_dashboard_loops_returns_four_cards(client):
    resp = client.get("/api/dashboard/loops")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 4
    ids = {c["id"] for c in data}
    assert ids == {"inbound", "production", "outbound", "network"}


def test_dashboard_network_summary(client):
    resp = client.get("/api/dashboard/network")
    assert resp.status_code == 200
    data = resp.json()
    for key in ("supplier_count", "plant_count", "retailer_count", "active_transfers"):
        assert key in data
        assert isinstance(data[key], int)


def test_retailers_endpoint_returns_list(client):
    resp = client.get("/api/retailers")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
