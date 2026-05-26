from app import mock_data


def test_list_lots_returns_200(client):
    r = client.get("/api/lots")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_lots_non_empty(client):
    r = client.get("/api/lots")
    assert len(r.json()) > 0


def test_get_lot_by_id(client):
    lot_id = mock_data.INGREDIENT_LOTS[0]["lot_id"]
    r = client.get(f"/api/lots/{lot_id}")
    assert r.status_code == 200
    assert r.json()["lot_id"] == lot_id


def test_get_lot_not_found(client):
    r = client.get("/api/lots/nonexistent_lot_id")
    assert r.status_code == 404


def test_lot_has_required_fields(client):
    r = client.get("/api/lots")
    lot = r.json()[0]
    assert "lot_id" in lot
    assert "facility_id" in lot
    assert "quantity_kg" in lot
    assert "expiry_date" in lot


def test_get_lot_substitutions(client):
    lot_id = mock_data.INGREDIENT_LOTS[0]["lot_id"]
    r = client.get(f"/api/lots/{lot_id}/substitutions")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_filter_by_facility(client):
    r = client.get("/api/lots?facility_id=plant_1")
    assert r.status_code == 200
    data = r.json()
    assert all(lot["facility_id"] == "plant_1" for lot in data)
