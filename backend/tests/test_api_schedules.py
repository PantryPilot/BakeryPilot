from app import mock_data


def test_list_schedules_returns_200(client):
    r = client.get("/api/schedules")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_schedules_non_empty(client):
    r = client.get("/api/schedules")
    assert len(r.json()) > 0


def test_get_schedule_by_id(client):
    sched_id = mock_data.PRODUCTION_SCHEDULES[0]["schedule_id"]
    r = client.get(f"/api/schedules/{sched_id}")
    assert r.status_code == 200
    assert r.json()["schedule_id"] == sched_id


def test_get_schedule_not_found(client):
    r = client.get("/api/schedules/nonexistent_sched")
    assert r.status_code == 404


def test_get_schedule_diff(client):
    sched_id = mock_data.PRODUCTION_SCHEDULES[0]["schedule_id"]
    r = client.get(f"/api/schedules/{sched_id}/diff")
    assert r.status_code == 200


def test_schedule_has_required_fields(client):
    r = client.get("/api/schedules")
    sched = r.json()[0]
    assert "schedule_id" in sched
    assert "facility_id" in sched
