def test_list_suppliers_returns_200(client):
    r = client.get("/api/suppliers")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_supplier_not_found(client):
    r = client.get("/api/suppliers/nonexistent_supplier")
    assert r.status_code == 404


def test_get_supplier_moq_tax_not_found(client):
    r = client.get("/api/suppliers/nonexistent_supplier/moq_tax")
    assert r.status_code == 404


def test_suppliers_list_schema(client):
    suppliers = client.get("/api/suppliers").json()
    for sup in suppliers:
        assert "supplier_id" in sup
        assert "name" in sup
        assert "on_time_rate" in sup
