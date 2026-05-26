def test_list_forecasts_returns_200(client):
    r = client.get("/api/forecasts")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_forecast_schema(client):
    forecasts = client.get("/api/forecasts").json()
    for f in forecasts:
        assert "sku_id" in f or "date" in f
