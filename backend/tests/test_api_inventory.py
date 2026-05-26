def test_list_lots_returns_200(client):
    r = client.get("/api/lots")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_lot_not_found(client):
    r = client.get("/api/lots/nonexistent_lot_id")
    assert r.status_code == 404


def test_get_lot_substitutions_not_found(client):
    r = client.get("/api/lots/nonexistent_lot/substitutions")
    assert r.status_code == 404


def test_filter_by_facility(client):
    r = client.get("/api/lots?facility_id=plant-toronto")
    assert r.status_code == 200


def test_lots_list_schema(client):
    lots = client.get("/api/lots").json()
    for lot in lots:
        assert "lot_id" in lot
        assert "facility_id" in lot
        assert "quantity_kg" in lot
        assert "expiry_date" in lot
