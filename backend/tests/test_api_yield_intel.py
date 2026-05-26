def test_list_yield_runs_returns_200(client):
    r = client.get("/api/yield")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_yield_run_not_found(client):
    r = client.get("/api/yield/nonexistent_run")
    assert r.status_code == 404


def test_diagnose_yield_run_not_found(client):
    r = client.get("/api/yield/nonexistent_run/diagnose")
    assert r.status_code == 404


def test_yield_runs_list_schema(client):
    runs = client.get("/api/yield").json()
    for run in runs:
        assert "run_id" in run
        assert "status" in run
