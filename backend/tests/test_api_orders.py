def test_list_supplier_orders_returns_200(client):
    r = client.get("/api/orders")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_retailer_orders_returns_200(client):
    r = client.get("/api/retailer_orders")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_draft_supplier_order(client):
    payload = {
        "supplier_id": "sup_a",
        "items": [{"ingredient_id": "ing_flour", "quantity_kg": 500.0, "unit_price": 1.20}],
        "delivery_date": "2026-06-05",
    }
    r = client.post("/api/orders/draft", json=payload)
    assert r.status_code == 200
    body = r.json()
    assert "action_card_id" in body


def test_create_retailer_order(client):
    payload = {
        "retailer_id": "r-cc",
        "sku_id": "sku_blueberry_muffin",
        "quantity": 100,
    }
    r = client.post("/api/retailer_orders", json=payload)
    assert r.status_code in (200, 201, 422)
