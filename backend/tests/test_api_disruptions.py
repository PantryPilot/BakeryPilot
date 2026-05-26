def test_list_disruptions_returns_200(client):
    r = client.get("/api/disruptions")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_disruptions_non_empty(client):
    r = client.get("/api/disruptions")
    assert len(r.json()) > 0


def test_disruption_has_required_fields(client):
    r = client.get("/api/disruptions")
    d = r.json()[0]
    assert "signal_id" in d
    assert "severity" in d
    assert "message" in d
