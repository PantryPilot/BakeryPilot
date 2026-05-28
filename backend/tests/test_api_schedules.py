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


def test_create_schedule_validation(client):
    r = client.post(
        "/api/schedules",
        json={
            "facility_id": "plant-toronto",
            "line_id": "line-toronto-1",
            "sku_id": "sku-wonder-classic-white-loaf",
            "start_at": "2026-05-27T18:00:00Z",
            "end_at": "2026-05-27T14:00:00Z",
            "quantity_units": 100,
        },
    )
    assert r.status_code == 422


def test_delete_schedule_not_found(client):
    r = client.delete("/api/schedules/nonexistent_sched")
    assert r.status_code == 404


def test_patch_schedule_not_found(client):
    r = client.patch(
        "/api/schedules/nonexistent_sched",
        json={"start_at": "2026-05-27T10:00:00Z", "end_at": "2026-05-27T12:00:00Z"},
    )
    assert r.status_code == 404


def test_patch_schedule_requires_fields(client):
    import uuid

    r = client.patch(f"/api/schedules/{uuid.uuid4()}", json={})
    assert r.status_code == 422
