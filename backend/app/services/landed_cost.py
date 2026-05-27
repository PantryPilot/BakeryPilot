def compute_landed_cost(
    unit_price: float,
    quantity_kg: float,
    holding_cost_per_kg_per_day: float,
    expected_days_held: float,
    moq_kg: float = 0.0,
) -> dict:
    base_cost = unit_price * quantity_kg
    overage_kg = max(0.0, moq_kg - quantity_kg)
    overage_cost = overage_kg * unit_price
    holding_cost = (quantity_kg + overage_kg) * holding_cost_per_kg_per_day * expected_days_held
    total = base_cost + overage_cost + holding_cost
    return {
        "unit_price": round(unit_price, 4),
        "quantity_kg": quantity_kg,
        "base_cost": round(base_cost, 2),
        "overage_cost": round(overage_cost, 2),
        "holding_cost": round(holding_cost, 2),
        "total": round(total, 2),
    }
