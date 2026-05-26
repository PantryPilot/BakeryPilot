def test_list_notification_drafts_returns_200(client):
    r = client.get("/api/notifications/drafts")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_generate_notification_drafts(client):
    payload = {
        "stakeholder_ids": ["stk_1"],
        "subject": "Blueberry shortage alert",
        "body_md": "Plant 1 blueberry supply at risk due to cold-chain incident.",
        "kind": "supplier_order",
    }
    r = client.post("/api/notifications/drafts", json=payload)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
