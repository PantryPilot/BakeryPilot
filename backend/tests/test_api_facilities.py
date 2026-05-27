def test_list_facilities_returns_list(client):
    resp = client.get("/api/facilities")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_facility_missing_returns_404(client):
    resp = client.get("/api/facilities/missing_id")
    assert resp.status_code == 404
