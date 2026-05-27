def test_list_schedules_returns_200(client):
    r = client.get("/api/schedules")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_get_schedule_not_found(client):
    r = client.get("/api/schedules/nonexistent_sched")
    assert r.status_code == 404


def test_get_schedule_diff_not_found(client):
    r = client.get("/api/schedules/nonexistent_sched/diff")
    assert r.status_code == 404


def test_get_current_schedule_diff(client):
    r = client.get("/api/schedules/current/diff")
    # Mock DB has no schedules; alias must resolve without UUID coercion crash.
    assert r.status_code == 404
    assert "invalid UUID" not in r.text


def test_schedules_list_schema(client):
    schedules = client.get("/api/schedules").json()
    for sched in schedules:
        assert "schedule_id" in sched
        assert "facility_id" in sched
