"""Unit tests for generate_demo_operations agent tool."""

from unittest.mock import MagicMock, patch

import pytest
from langchain_core.tools import ToolException

from agent.tools.demo_tools import generate_demo_operations


def test_generate_demo_operations_success():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "retailer_orders": [{"order_id": "r1"}],
        "supplier_orders": [],
        "schedules": [{"schedule_id": "s1"}],
        "totals": {"retailer_orders": 1, "supplier_orders": 0, "schedules": 1},
    }

    with patch("agent.tools.demo_tools.httpx.post", return_value=mock_response) as mock_post:
        result = generate_demo_operations.invoke(
            {
                "retailer_order_count": 3,
                "supplier_order_count": 2,
                "schedule_count": 4,
                "facility_id": "plant-toronto",
            }
        )

    mock_post.assert_called_once()
    call_kwargs = mock_post.call_args
    assert call_kwargs[1]["json"]["retailer_order_count"] == 3
    assert call_kwargs[1]["json"]["facility_id"] == "plant-toronto"
    assert result["totals"]["retailer_orders"] == 1


def test_generate_demo_operations_raises_on_error():
    mock_response = MagicMock()
    mock_response.status_code = 422
    mock_response.text = "missing master data"

    with patch("agent.tools.demo_tools.httpx.post", return_value=mock_response):
        with pytest.raises(ToolException, match="422"):
            generate_demo_operations.invoke({})
