def test_list_negotiations_returns_200(client):
    r = client.get("/api/negotiations")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_negotiation_draft_supplier_not_found(client):
    payload = {
        "supplier_id": "nonexistent_supplier",
        "trigger_kind": "moq_tax",
        "body_md": "Test negotiation message.",
    }
    r = client.post("/api/negotiations", json=payload)
    assert r.status_code == 404


def test_mark_negotiation_sent_not_found(client):
    r = client.post("/api/negotiations/nonexistent_draft/mark_sent", json={})
    assert r.status_code == 404
