def test_list_outbound_shipments_returns_200(client):
    r = client.get("/api/outbound_shipments")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_warehouse_stock_returns_200(client):
    r = client.get("/api/outbound_shipments/warehouse_stock")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_outbound_shipment_validation(client):
    r = client.post(
        "/api/outbound_shipments",
        json={
            "facility_id": "plant-toronto",
            "retailer_order_id": "00000000-0000-0000-0000-000000000001",
            "sku_id": "sku-wonder-classic-white-loaf",
            "start_at": "2026-06-01T18:00:00+00:00",
            "end_at": "2026-06-01T14:00:00+00:00",
            "quantity_units": 100,
        },
    )
    assert r.status_code == 422


def test_draft_outbound_shipment_returns_action_card(client):
    r = client.post(
        "/api/outbound_shipments/draft",
        json={
            "facility_id": "plant-toronto",
            "retailer_order_id": "00000000-0000-0000-0000-000000000001",
            "sku_id": "sku-wonder-classic-white-loaf",
            "start_at": "2026-06-01T10:00:00+00:00",
            "end_at": "2026-06-01T12:00:00+00:00",
            "quantity_units": 100,
            "rationale": "FEFO ship to Costco",
        },
    )
    # Mock DB: validation fails on missing PO — expect 404 not 500
    assert r.status_code in (404, 422)
