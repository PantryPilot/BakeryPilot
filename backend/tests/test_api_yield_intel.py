from app import mock_data


def test_list_yield_runs_returns_200(client):
    r = client.get("/api/yield")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_yield_run_by_id(client):
    run_id = mock_data.YIELD_RUNS[0]["run_id"]
    r = client.get(f"/api/yield/{run_id}")
    assert r.status_code == 200
    assert r.json()["run_id"] == run_id


def test_get_yield_run_not_found(client):
    r = client.get("/api/yield/nonexistent_run")
    assert r.status_code == 404


def test_get_yield_diagnosis(client):
    run_id = mock_data.YIELD_RUNS[0]["run_id"]
    r = client.get(f"/api/yield/{run_id}/diagnose")
    assert r.status_code == 200


def test_yield_run_has_required_fields(client):
    r = client.get("/api/yield")
    run = r.json()[0]
    assert "run_id" in run
    assert "status" in run
