def test_list_disruptions_returns_200(client):
    r = client.get("/api/disruptions")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_disruptions_list_schema(client):
    signals = client.get("/api/disruptions").json()
    for d in signals:
        assert "signal_id" in d
        assert "severity" in d
        assert "message" in d
