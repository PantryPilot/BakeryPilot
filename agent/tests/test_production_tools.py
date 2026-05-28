from agent.tools.production_tools import _score_product


def test_score_exact_name_match():
    product = {
        "sku_id": "sku-country-harvest-cinnamon-raisin",
        "name": "Country Harvest Cinnamon Raisin Bread",
        "category": "bread",
    }
    score = _score_product("Country Harvest Cinnamon Raisin Bread", product)
    assert score >= 10_000


def test_score_rejects_invented_slug_pattern():
    product = {
        "sku_id": "sku-country-harvest-cinnamon-raisin",
        "name": "Country Harvest Cinnamon Raisin Bread",
        "category": "bread",
    }
    # LLM often invents this slug — resolver should still rank the real row highly.
    score = _score_product("country harvest cinnamon raisin bread", product)
    assert score >= 400


def test_score_partial_name():
    product = {
        "sku_id": "sku-ace-sourdough-bistro",
        "name": "ACE Sourdough Bistro Loaf",
        "category": "bread",
    }
    score = _score_product("sourdough bistro", product)
    assert score >= 150
