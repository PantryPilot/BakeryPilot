def test_list_summaries_returns_200(client):
    r = client.get("/api/summaries")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_summary_not_found(client):
    r = client.get("/api/summaries/nonexistent_summary")
    assert r.status_code == 404


def test_summaries_list_schema(client):
    summaries = client.get("/api/summaries").json()
    for s in summaries:
        assert "summary_id" in s
