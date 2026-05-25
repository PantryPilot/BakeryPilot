from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class VerificationLevel(str, Enum):
    AUTO_COMMIT = "auto_commit"
    PEER_VERIFY = "peer_verify"
    SUPERVISOR_APPROVE = "supervisor_approve"
    DUAL_SIGN_OFF = "dual_sign_off"


_ALLERGEN_KEYWORDS = {"sesame", "gluten", "dairy", "peanut", "tree nut", "allergen"}
_SAFETY_KEYWORDS = {"written off", "write-off", "recalled", "recall", "contaminated"}

_FINANCIAL_THRESHOLD_USD = 10_000.0
_LARGE_KG_THRESHOLD = 100.0
_MID_KG_THRESHOLD = 10.0


@dataclass
class VerificationDecision:
    level: VerificationLevel
    reasons: list[str]


def classify(
    transcript: str,
    quantity_kg: float | None = None,
    dollar_value: float | None = None,
) -> VerificationDecision:
    """Determine the verification level for a voice-captured inventory event.

    Levels (ascending strictness):
      auto_commit        – small routine delta, single facility, known ingredient
      peer_verify        – mid-range quantity or moderately critical ingredient
      supervisor_approve – large delta or involves an allergen-class ingredient
      dual_sign_off      – crosses financial or safety threshold
    """
    text = transcript.lower()
    reasons: list[str] = []

    has_allergen = any(kw in text for kw in _ALLERGEN_KEYWORDS)
    has_safety = any(kw in text for kw in _SAFETY_KEYWORDS)
    large_qty = quantity_kg is not None and quantity_kg > _LARGE_KG_THRESHOLD
    mid_qty = quantity_kg is not None and quantity_kg > _MID_KG_THRESHOLD
    high_value = dollar_value is not None and dollar_value > _FINANCIAL_THRESHOLD_USD

    if has_safety or high_value:
        if has_safety:
            reasons.append("safety or recall keyword detected")
        if high_value:
            reasons.append(f"dollar value ${dollar_value:,.0f} exceeds threshold")
        return VerificationDecision(level=VerificationLevel.DUAL_SIGN_OFF, reasons=reasons)

    if has_allergen or large_qty:
        if has_allergen:
            reasons.append("allergen-class ingredient mentioned")
        if large_qty:
            reasons.append(f"{quantity_kg:.0f} kg exceeds large-delta threshold")
        return VerificationDecision(level=VerificationLevel.SUPERVISOR_APPROVE, reasons=reasons)

    if mid_qty:
        reasons.append(f"{quantity_kg:.0f} kg is a mid-range delta")
        return VerificationDecision(level=VerificationLevel.PEER_VERIFY, reasons=reasons)

    reasons.append("small routine delta")
    return VerificationDecision(level=VerificationLevel.AUTO_COMMIT, reasons=reasons)
