def test_list_stakeholders_returns_200(client):
    r = client.get("/api/stakeholders")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_stakeholders_non_empty(client):
    r = client.get("/api/stakeholders")
    assert len(r.json()) > 0


def test_stakeholder_has_required_fields(client):
    r = client.get("/api/stakeholders")
    s = r.json()[0]
    assert "stakeholder_id" in s
    assert "name" in s
    assert "role" in s


def test_identify_stakeholders(client):
    payload = {"action_kind": "supplier_order"}
    r = client.post("/api/stakeholders/identify", json=payload)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
