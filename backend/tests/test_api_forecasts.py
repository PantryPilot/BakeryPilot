def test_list_forecasts_returns_200(client):
    r = client.get("/api/forecasts")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_list_forecasts_non_empty(client):
    r = client.get("/api/forecasts")
    assert len(r.json()) > 0


def test_forecast_has_required_fields(client):
    r = client.get("/api/forecasts")
    forecast = r.json()[0]
    assert "sku_id" in forecast or "date" in forecast
