def test_list_notification_drafts_returns_200(client):
    r = client.get("/api/notifications/drafts")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_generate_notification_drafts_no_stakeholders(client):
    payload = {
        "stakeholder_ids": ["nonexistent_stk"],
        "subject": "Test subject",
        "body_md": "Test message.",
        "kind": "supplier_order",
    }
    r = client.post("/api/notifications/drafts", json=payload)
    assert r.status_code == 400
