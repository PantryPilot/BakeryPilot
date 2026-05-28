def test_demo_generate_endpoint_accepts_request(client):
    r = client.post(
        "/api/demo/generate",
        json={
            "retailer_order_count": 0,
            "supplier_order_count": 0,
            "schedule_count": 0,
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["totals"] == {
        "retailer_orders": 0,
        "supplier_orders": 0,
        "schedules": 0,
    }


def test_demo_generate_endpoint_validates_counts(client):
    r = client.post(
        "/api/demo/generate",
        json={"retailer_order_count": 25},
    )
    assert r.status_code == 422
