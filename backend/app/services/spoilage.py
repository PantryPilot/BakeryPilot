from datetime import date


def compute_spoilage_risk(
    quantity_kg: float,
    expiry_date: date,
    kg_scheduled_before_expiry: float,
    today: date | None = None,
) -> float:
    today = today or date.today()
    if expiry_date <= today:
        return 2.0
    scheduled = max(0.0, kg_scheduled_before_expiry)
    if scheduled == 0:
        return 1.0
    return round(quantity_kg / scheduled, 4)
