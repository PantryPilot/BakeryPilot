def test_get_current_user_falls_back_when_table_missing(client):
    resp = client.get("/api/users/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["user_id"] == "demo_user"
    assert data["display_name"]  # not empty
    assert "@" in data["email"]


def test_get_user_settings_returns_defaults(client):
    resp = client.get("/api/users/me/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert data["theme"] in ("dark", "light")
    assert data["accent"] in ("blue", "emerald", "violet", "amber", "teal", "indigo")
    assert isinstance(data["notif_toast"], bool)
