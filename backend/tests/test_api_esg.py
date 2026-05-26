def test_esg_counter_returns_200(client):
    r = client.get("/api/esg/counter")
    assert r.status_code == 200


def test_esg_counter_has_required_fields(client):
    r = client.get("/api/esg/counter")
    body = r.json()
    assert "kg_avoided" in body or "dollars_saved" in body


def test_esg_patterns_returns_200(client):
    r = client.get("/api/esg/patterns")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_esg_patterns_schema(client):
    patterns = client.get("/api/esg/patterns").json()
    for p in patterns:
        assert "pattern_id" in p
        assert "occurrences" in p
