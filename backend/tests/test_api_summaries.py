from app import mock_data


def test_list_summaries_returns_200(client):
    r = client.get("/api/summaries")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_summaries_non_empty(client):
    r = client.get("/api/summaries")
    assert len(r.json()) > 0


def test_get_summary_by_id(client):
    summary_id = mock_data.WEEKLY_SUMMARIES[0]["summary_id"]
    r = client.get(f"/api/summaries/{summary_id}")
    assert r.status_code == 200
    assert r.json()["summary_id"] == summary_id


def test_get_summary_not_found(client):
    r = client.get("/api/summaries/nonexistent_summary")
    assert r.status_code == 404


def test_summary_has_required_fields(client):
    r = client.get("/api/summaries")
    s = r.json()[0]
    assert "summary_id" in s
