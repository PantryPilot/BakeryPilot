from app import mock_data


def test_list_suppliers_returns_200(client):
    r = client.get("/api/suppliers")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_suppliers_non_empty(client):
    r = client.get("/api/suppliers")
    assert len(r.json()) > 0


def test_get_supplier_by_id(client):
    sup_id = mock_data.SUPPLIERS[0]["supplier_id"]
    r = client.get(f"/api/suppliers/{sup_id}")
    assert r.status_code == 200
    assert r.json()["supplier_id"] == sup_id


def test_get_supplier_not_found(client):
    r = client.get("/api/suppliers/nonexistent_supplier")
    assert r.status_code == 404


def test_supplier_has_required_fields(client):
    r = client.get("/api/suppliers")
    sup = r.json()[0]
    assert "supplier_id" in sup
    assert "name" in sup
    assert "on_time_rate" in sup


def test_get_supplier_moq_tax(client):
    sup_id = mock_data.SUPPLIERS[0]["supplier_id"]
    r = client.get(f"/api/suppliers/{sup_id}/moq_tax")
    assert r.status_code == 200
    assert isinstance(r.json(), list)
