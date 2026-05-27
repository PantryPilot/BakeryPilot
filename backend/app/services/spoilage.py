from datetime import date


def compute_spoilage_risk(
    quantity_kg: float,
    expiry_date: date,
    kg_scheduled_before_expiry: float,
    today: date | None = None,
) -> float:
    today = today or date.today()
    if expiry_date <= today:
        return 1.0

    # Normalize to a 0..1 score so UI thresholds can be meaningful.
    days_left = max(0, (expiry_date - today).days)
    urgency = 1.0 - min(days_left, 60) / 60.0

    # Larger lots are harder to consume quickly; use capped pressure.
    qty_pressure = min(max(quantity_kg, 0.0) / 1200.0, 1.0)

    scheduled = max(0.0, kg_scheduled_before_expiry)
    coverage = 1.0 if quantity_kg <= 0 else min(scheduled / quantity_kg, 1.0)
    unscheduled = 1.0 - coverage

    risk = (0.62 * urgency) + (0.28 * qty_pressure) + (0.10 * unscheduled)
    return round(min(max(risk, 0.0), 1.0), 4)
