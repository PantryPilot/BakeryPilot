from app.services.landed_cost import compute_landed_cost


def moq_resolution_paths(
    required_kg: float,
    moq_kg: float,
    unit_price: float,
    holding_cost_per_kg_per_day: float,
    avg_days_held: float = 30.0,
) -> list[dict]:
    if required_kg >= moq_kg:
        return [{
            "path": "exact_order",
            "description": "Order exactly what's needed — meets MOQ",
            "order_kg": required_kg,
            "overage_kg": 0.0,
            "dollar_impact": 0.0,
        }]

    overage_kg = moq_kg - required_kg
    holding_per_day = holding_cost_per_kg_per_day * overage_kg

    accept = compute_landed_cost(unit_price, moq_kg, holding_cost_per_kg_per_day, avg_days_held, moq_kg)
    pull_forward_days = overage_kg / max(1.0, required_kg / avg_days_held)

    return [
        {
            "path": "accept_overage",
            "description": f"Order MOQ ({moq_kg} kg); carry {round(overage_kg, 1)} kg overage",
            "order_kg": moq_kg,
            "overage_kg": overage_kg,
            "dollar_impact": round(accept["holding_cost"], 2),
        },
        {
            "path": "pull_forward",
            "description": f"Pull forward ~{round(pull_forward_days)} days of future demand to reach MOQ",
            "order_kg": moq_kg,
            "overage_kg": overage_kg,
            "dollar_impact": round(holding_per_day * (pull_forward_days / 2), 2),
        },
        {
            "path": "split_order",
            "description": "Split across two suppliers to reduce individual overage",
            "order_kg": required_kg,
            "overage_kg": 0.0,
            "dollar_impact": round(unit_price * required_kg * 0.03, 2),
        },
    ]
