def test_list_stakeholders_returns_200(client):
    r = client.get("/api/stakeholders")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_stakeholders_schema(client):
    stakeholders = client.get("/api/stakeholders").json()
    for s in stakeholders:
        assert "stakeholder_id" in s
        assert "name" in s
        assert "role" in s


def test_identify_stakeholders(client):
    payload = {"action_kind": "supplier_order"}
    r = client.post("/api/stakeholders/identify", json=payload)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
