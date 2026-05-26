def test_list_action_cards_returns_200(client):
    r = client.get("/api/action_cards")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_action_cards_filter_by_state(client):
    r = client.get("/api/action_cards?state=pending")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_action_card_not_found(client):
    r = client.get("/api/action_cards/nonexistent_card")
    assert r.status_code == 404


def test_confirm_action_card_not_found(client):
    r = client.post("/api/action_cards/nonexistent_card/confirm", json={})
    assert r.status_code == 404


def test_reject_action_card_not_found(client):
    r = client.post("/api/action_cards/nonexistent_card/reject", json={})
    assert r.status_code == 404
