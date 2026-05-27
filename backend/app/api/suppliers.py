import asyncio
import json
import os
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.db.models import (
    IngredientLot,
    MoqTaxEntry,
    NegotiationDraft,
    Supplier as SupplierORM,
    SupplierMessage as SupplierMessageORM,
    SupplierOrder,
)
from app.db.session import get_db
from app.models.suppliers import MOQTaxEntry, Supplier, SupplierMessage

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


async def _supplier_to_model(sup: SupplierORM, session: AsyncSession) -> Supplier:
    now = datetime.utcnow()
    quarter = f"{now.year}-Q{(now.month - 1) // 3 + 1}"
    moq_tax_result = await session.execute(
        select(func.sum(MoqTaxEntry.holding_cost)).where(
            MoqTaxEntry.supplier_id == sup.supplier_id,
            MoqTaxEntry.quarter == quarter,
        )
    )
    moq_tax_usd = float(moq_tax_result.scalar() or 0.0)

    return Supplier(
        supplier_id=sup.supplier_id,
        name=sup.name,
        personality=sup.personality_tag or "unknown",
        contact_email=sup.contact_email or "",
        payment_terms=sup.payment_terms or "",
        moq_kg=float(sup.moq_kg or 0),
        lead_time_mean_days=float(sup.lead_time_mean_days or 0),
        lead_time_std_days=float(sup.lead_time_std_days or 0),
        window_earliest_day=int(sup.window_earliest_day or 0),
        window_latest_day=int(sup.window_latest_day or 0),
        contract_expiry_date=sup.contract_expiry_date.isoformat() if sup.contract_expiry_date else "",
        on_time_rate=float(sup.on_time_rate or 0),
        fill_rate=float(sup.fill_rate or 0),
        window_compliance_rate=float(sup.window_compliance_rate or 0),
        price_variance_vs_benchmark=float(sup.price_variance_vs_benchmark or 0),
        moq_tax_quarter_usd=moq_tax_usd,
        contact_name=sup.contact_name,
        phone=sup.phone,
        website=sup.website,
        address=sup.address,
        notes=sup.notes,
    )


@router.get("", response_model=list[Supplier])
async def list_suppliers(db: AsyncSession = Depends(get_db)) -> list[Supplier]:
    sups = (await db.execute(select(SupplierORM))).scalars().all()
    return [await _supplier_to_model(s, db) for s in sups]


@router.get("/{supplier_id}", response_model=Supplier)
async def get_supplier(supplier_id: str, db: AsyncSession = Depends(get_db)) -> Supplier:
    sup = await db.get(SupplierORM, supplier_id)
    if not sup:
        raise HTTPException(404, f"supplier {supplier_id} not found")
    return await _supplier_to_model(sup, db)


class SupplierPerformancePoint(BaseModel):
    week_start: str
    on_time_rate: float
    fill_rate: float
    window_compliance_rate: float


class SupplierPerformance(BaseModel):
    supplier_id: str
    points: list[SupplierPerformancePoint]


class ScorecardSummary(BaseModel):
    supplier_count: int
    tier_a: int
    tier_b: int
    tier_c: int
    pending_drafts: int
    contracts_expiring_60d: int
    avg_on_time_rate: float
    avg_fill_rate: float


def _tier(on_time: float, fill: float) -> str:
    """Match the frontend's tier rules (kept in sync with TIER_COPY logic)."""
    if on_time >= 0.95 and fill >= 0.97:
        return "A"
    if on_time >= 0.90:
        return "B"
    return "C"


@router.get("/_meta/scorecard_summary", response_model=ScorecardSummary)
async def scorecard_summary(db: AsyncSession = Depends(get_db)) -> ScorecardSummary:
    sups = (await db.execute(select(SupplierORM))).scalars().all()
    today = datetime.utcnow().date()
    expiring_cutoff = today + timedelta(days=60)

    tier_a = tier_b = tier_c = expiring = 0
    on_time_sum = fill_sum = 0.0
    for s in sups:
        t = _tier(float(s.on_time_rate or 0), float(s.fill_rate or 0))
        if t == "A":
            tier_a += 1
        elif t == "B":
            tier_b += 1
        else:
            tier_c += 1
        on_time_sum += float(s.on_time_rate or 0)
        fill_sum += float(s.fill_rate or 0)
        if s.contract_expiry_date and s.contract_expiry_date <= expiring_cutoff:
            expiring += 1

    pending_drafts = (
        await db.execute(
            select(func.count())
            .select_from(SupplierOrder)
            .where(SupplierOrder.status.in_(["draft", "pending_confirm"]))
        )
    ).scalar_one() or 0

    n = max(1, len(sups))
    return ScorecardSummary(
        supplier_count=len(sups),
        tier_a=tier_a,
        tier_b=tier_b,
        tier_c=tier_c,
        pending_drafts=int(pending_drafts),
        contracts_expiring_60d=expiring,
        avg_on_time_rate=round(on_time_sum / n, 4),
        avg_fill_rate=round(fill_sum / n, 4),
    )


@router.get("/{supplier_id}/performance", response_model=SupplierPerformance)
async def supplier_performance(
    supplier_id: str, db: AsyncSession = Depends(get_db)
) -> SupplierPerformance:
    sup = await db.get(SupplierORM, supplier_id)
    if not sup:
        raise HTTPException(404, f"supplier {supplier_id} not found")

    # Derive 8 weekly points from the supplier's current snapshot rates with a
    # deterministic ±5% wobble so we don't need a new historical table for the
    # sparkline. (Documented in the audit doc; can be replaced with a real
    # supplier_performance_history table later without a frontend change.)
    base_on_time = float(sup.on_time_rate or 0.9)
    base_fill = float(sup.fill_rate or 0.95)
    base_window = float(sup.window_compliance_rate or 0.88)

    pts: list[SupplierPerformancePoint] = []
    today = datetime.utcnow().date()
    seed = sum(ord(c) for c in supplier_id) or 1
    for i in range(8):
        wobble_on = ((seed + i * 7) % 11 - 5) / 100.0
        wobble_fill = ((seed + i * 13) % 9 - 4) / 100.0
        wobble_window = ((seed + i * 17) % 13 - 6) / 100.0
        wk = today - timedelta(days=(7 - i) * 7)
        pts.append(
            SupplierPerformancePoint(
                week_start=wk.isoformat(),
                on_time_rate=round(max(0.0, min(1.0, base_on_time + wobble_on)), 4),
                fill_rate=round(max(0.0, min(1.0, base_fill + wobble_fill)), 4),
                window_compliance_rate=round(
                    max(0.0, min(1.0, base_window + wobble_window)), 4
                ),
            )
        )
    return SupplierPerformance(supplier_id=supplier_id, points=pts)


class CreateSupplierRequest(BaseModel):
    supplier_id: str
    name: str
    contact_email: str | None = None
    payment_terms: str | None = None
    moq_kg: float | None = None
    lead_time_mean_days: float | None = None
    lead_time_std_days: float | None = None
    on_time_rate: float = 0.90
    fill_rate: float = 0.95
    window_compliance_rate: float = 0.88
    contact_name: str | None = None
    phone: str | None = None
    website: str | None = None
    address: str | None = None
    notes: str | None = None


class UpdateSupplierRequest(BaseModel):
    name: str | None = None
    contact_email: str | None = None
    payment_terms: str | None = None
    moq_kg: float | None = None
    lead_time_mean_days: float | None = None
    lead_time_std_days: float | None = None
    on_time_rate: float | None = None
    fill_rate: float | None = None
    window_compliance_rate: float | None = None
    contact_name: str | None = None
    phone: str | None = None
    website: str | None = None
    address: str | None = None
    notes: str | None = None


@router.post("", response_model=Supplier)
async def create_supplier(
    req: CreateSupplierRequest, db: AsyncSession = Depends(get_db)
) -> Supplier:
    if await db.get(SupplierORM, req.supplier_id):
        raise HTTPException(409, f"supplier {req.supplier_id} already exists")
    sup = SupplierORM(
        supplier_id=req.supplier_id,
        name=req.name,
        contact_email=req.contact_email,
        payment_terms=req.payment_terms,
        moq_kg=req.moq_kg,
        lead_time_mean_days=req.lead_time_mean_days or 7.0,
        lead_time_std_days=req.lead_time_std_days or 1.0,
        on_time_rate=req.on_time_rate,
        fill_rate=req.fill_rate,
        window_compliance_rate=req.window_compliance_rate,
        price_variance_vs_benchmark=0.0,
        contact_name=req.contact_name,
        phone=req.phone,
        website=req.website,
        address=req.address,
        notes=req.notes,
    )
    db.add(sup)
    await db.commit()
    await db.refresh(sup)
    return await _supplier_to_model(sup, db)


@router.patch("/{supplier_id}", response_model=Supplier)
async def update_supplier(
    supplier_id: str, req: UpdateSupplierRequest, db: AsyncSession = Depends(get_db)
) -> Supplier:
    sup = await db.get(SupplierORM, supplier_id)
    if not sup:
        raise HTTPException(404, f"supplier {supplier_id} not found")
    if req.name is not None:
        sup.name = req.name
    if req.contact_email is not None:
        sup.contact_email = req.contact_email
    if req.payment_terms is not None:
        sup.payment_terms = req.payment_terms
    if req.moq_kg is not None:
        sup.moq_kg = req.moq_kg
    if req.lead_time_mean_days is not None:
        sup.lead_time_mean_days = req.lead_time_mean_days
    if req.lead_time_std_days is not None:
        sup.lead_time_std_days = req.lead_time_std_days
    if req.on_time_rate is not None:
        sup.on_time_rate = req.on_time_rate
    if req.fill_rate is not None:
        sup.fill_rate = req.fill_rate
    if req.window_compliance_rate is not None:
        sup.window_compliance_rate = req.window_compliance_rate
    if req.contact_name is not None:
        sup.contact_name = req.contact_name
    if req.phone is not None:
        sup.phone = req.phone
    if req.website is not None:
        sup.website = req.website
    if req.address is not None:
        sup.address = req.address
    if req.notes is not None:
        sup.notes = req.notes
    await db.commit()
    await db.refresh(sup)
    return await _supplier_to_model(sup, db)


@router.delete("/{supplier_id}", response_model=dict)
async def delete_supplier(
    supplier_id: str, db: AsyncSession = Depends(get_db)
) -> dict:
    sup = await db.get(SupplierORM, supplier_id)
    if not sup:
        raise HTTPException(404, f"supplier {supplier_id} not found")
    lots = (
        await db.execute(
            select(func.count()).select_from(IngredientLot).where(
                IngredientLot.supplier_id == supplier_id
            )
        )
    ).scalar_one()
    if lots > 0:
        raise HTTPException(
            409, f"supplier {supplier_id} has {lots} active lot(s); write them off or transfer them first"
        )
    await db.delete(sup)
    await db.commit()
    return {"deleted": supplier_id}


# ---------------------------------------------------------------------------
# Supplier communications: messages + agent negotiation
# ---------------------------------------------------------------------------

def _msg_to_model(m: SupplierMessageORM) -> SupplierMessage:
    return SupplierMessage(
        message_id=str(m.message_id),
        supplier_id=m.supplier_id,
        direction=m.direction,
        channel=m.channel,
        subject=m.subject,
        body=m.body,
        author=m.author,
        related_order_id=str(m.related_order_id) if m.related_order_id else None,
        related_negotiation_id=str(m.related_negotiation_id) if m.related_negotiation_id else None,
        sent_at=m.sent_at.isoformat(),
        read_at=m.read_at.isoformat() if m.read_at else None,
    )


@router.get("/{supplier_id}/messages", response_model=list[SupplierMessage])
async def list_messages(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[SupplierMessage]:
    if not await db.get(SupplierORM, supplier_id):
        raise HTTPException(404, f"supplier {supplier_id} not found")
    rows = (
        await db.execute(
            select(SupplierMessageORM)
            .where(SupplierMessageORM.supplier_id == supplier_id)
            .order_by(SupplierMessageORM.sent_at.asc())
        )
    ).scalars().all()
    return [_msg_to_model(m) for m in rows]


class CreateMessageRequest(BaseModel):
    direction: str = "outbound"
    channel: str = "email"
    subject: str | None = None
    body: str
    author: str | None = "demo_user"
    related_order_id: str | None = None
    related_negotiation_id: str | None = None


@router.post("/{supplier_id}/messages", response_model=SupplierMessage)
async def create_message(
    supplier_id: str,
    req: CreateMessageRequest,
    db: AsyncSession = Depends(get_db),
) -> SupplierMessage:
    if not await db.get(SupplierORM, supplier_id):
        raise HTTPException(404, f"supplier {supplier_id} not found")
    if req.direction not in ("inbound", "outbound"):
        raise HTTPException(422, "direction must be inbound|outbound")
    if req.channel not in ("email", "phone", "chat", "agent", "system"):
        raise HTTPException(422, "invalid channel")
    msg = SupplierMessageORM(
        supplier_id=supplier_id,
        direction=req.direction,
        channel=req.channel,
        subject=req.subject,
        body=req.body,
        author=req.author,
        related_order_id=req.related_order_id,
        related_negotiation_id=req.related_negotiation_id,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return _msg_to_model(msg)


class NegotiateRequest(BaseModel):
    goal: str
    tone: str = "firm-but-friendly"
    record_outbound: bool = False  # if true, also save the draft as an outbound message


class NegotiateResponse(BaseModel):
    draft_id: str
    supplier_id: str
    trigger_kind: str
    body_md: str
    proposed_subject: str
    message_id: str | None


def _pick_trigger_kind(on_time: float, window: float, moq_total: float, price_var: float) -> str:
    if moq_total >= 3000:
        return "moq_tax"
    if on_time < 0.90 or window < 0.85:
        return "late_window"
    if abs(price_var) >= 0.05:
        return "price_drift"
    return "moq_tax" if moq_total > 0 else "late_window"


@router.post("/{supplier_id}/negotiate", response_model=NegotiateResponse)
async def agent_negotiate(
    supplier_id: str,
    req: NegotiateRequest,
    db: AsyncSession = Depends(get_db),
) -> NegotiateResponse:
    """Generate a negotiation draft for a supplier by invoking the
    ProcurementAgent's draft_negotiation tool (Claude Opus 4.7).

    Persists the result as a NegotiationDraft and optionally records it
    as an outbound supplier message."""
    sup = await db.get(SupplierORM, supplier_id)
    if not sup:
        raise HTTPException(404, f"supplier {supplier_id} not found")

    quarter = f"{datetime.utcnow().year}-Q{(datetime.utcnow().month - 1) // 3 + 1}"
    moq_total = float(
        (
            await db.execute(
                select(func.sum(MoqTaxEntry.holding_cost)).where(
                    MoqTaxEntry.supplier_id == supplier_id,
                    MoqTaxEntry.quarter == quarter,
                )
            )
        ).scalar()
        or 0.0
    )

    on_time = float(sup.on_time_rate or 0.9)
    fill = float(sup.fill_rate or 0.95)
    window = float(sup.window_compliance_rate or 0.88)
    price_var = float(sup.price_variance_vs_benchmark or 0.0)

    trigger_kind = _pick_trigger_kind(on_time, window, moq_total, price_var)
    supporting_data = {
        "operator_goal": req.goal.strip(),
        "tone": req.tone,
        "contact_name": sup.contact_name or "Procurement Team",
        "on_time_rate_pct": round(on_time * 100, 1),
        "fill_rate_pct": round(fill * 100, 1),
        "window_compliance_pct": round(window * 100, 1),
        "moq_tax_quarter_usd": round(moq_total, 0),
        "moq_kg": float(sup.moq_kg or 0),
        "price_variance_vs_benchmark_pct": round(price_var * 100, 2),
    }

    # Ensure Anthropic key is in env for the agent tool's LLM call
    os.environ.setdefault("ANTHROPIC_API_KEY", settings.anthropic_api_key)
    from agent.tools.procurement_tools import draft_negotiation

    try:
        result = await asyncio.to_thread(
            draft_negotiation.invoke,
            {
                "trigger_kind": trigger_kind,
                "supplier_name": sup.name,
                "supporting_data": supporting_data,
            },
        )
    except Exception as exc:
        raise HTTPException(502, f"agent draft failed: {exc}") from exc

    body_md = result["body_md"]
    subject = result["subject"]

    draft = NegotiationDraft(
        supplier_id=supplier_id,
        trigger_kind=trigger_kind,
        body_md=body_md,
    )
    db.add(draft)
    await db.flush()

    message_id: str | None = None
    if req.record_outbound:
        msg = SupplierMessageORM(
            supplier_id=supplier_id,
            direction="outbound",
            channel="agent",
            subject=subject,
            body=body_md,
            author="ProcurementAgent",
            related_negotiation_id=draft.draft_id,
        )
        db.add(msg)
        await db.flush()
        message_id = str(msg.message_id)

    await db.commit()
    await db.refresh(draft)
    return NegotiateResponse(
        draft_id=str(draft.draft_id),
        supplier_id=supplier_id,
        trigger_kind=trigger_kind,
        body_md=body_md,
        proposed_subject=subject,
        message_id=message_id,
    )


@router.post("/{supplier_id}/negotiate/stream")
async def agent_negotiate_stream(
    supplier_id: str,
    req: NegotiateRequest,
    db: AsyncSession = Depends(get_db),
):
    """SSE-streaming variant of /negotiate. Yields the agent-drafted email
    token-by-token, then persists the final draft and emits a `done` event
    with the draft_id and parsed subject."""
    sup = await db.get(SupplierORM, supplier_id)
    if not sup:
        raise HTTPException(404, f"supplier {supplier_id} not found")

    quarter = f"{datetime.utcnow().year}-Q{(datetime.utcnow().month - 1) // 3 + 1}"
    moq_total = float(
        (
            await db.execute(
                select(func.sum(MoqTaxEntry.holding_cost)).where(
                    MoqTaxEntry.supplier_id == supplier_id,
                    MoqTaxEntry.quarter == quarter,
                )
            )
        ).scalar()
        or 0.0
    )

    on_time = float(sup.on_time_rate or 0.9)
    fill = float(sup.fill_rate or 0.95)
    window = float(sup.window_compliance_rate or 0.88)
    price_var = float(sup.price_variance_vs_benchmark or 0.0)
    trigger_kind = _pick_trigger_kind(on_time, window, moq_total, price_var)
    supplier_name = sup.name
    record_outbound = req.record_outbound
    supporting_data = {
        "operator_goal": req.goal.strip(),
        "tone": req.tone,
        "contact_name": sup.contact_name or "Procurement Team",
        "on_time_rate_pct": round(on_time * 100, 1),
        "fill_rate_pct": round(fill * 100, 1),
        "window_compliance_pct": round(window * 100, 1),
        "moq_tax_quarter_usd": round(moq_total, 0),
        "moq_kg": float(sup.moq_kg or 0),
        "price_variance_vs_benchmark_pct": round(price_var * 100, 2),
    }

    os.environ.setdefault("ANTHROPIC_API_KEY", settings.anthropic_api_key)
    from langchain_anthropic import ChatAnthropic
    from langchain_core.messages import HumanMessage, SystemMessage

    from agent.config import get_model
    from agent.prompts.store import get_prompt_store

    system_prompt = get_prompt_store().get("negotiation")
    user_msg = (
        f"Trigger: {trigger_kind}\n"
        f"Supplier: {supplier_name}\n"
        f"Data: {supporting_data}\n\n"
        "Draft the negotiation email now."
    )

    async def stream():
        yield {"event": "trigger", "data": json.dumps({"trigger_kind": trigger_kind})}
        llm = ChatAnthropic(model=get_model("negotiation"), streaming=True)
        accumulated = ""
        try:
            async for chunk in llm.astream(
                [SystemMessage(content=system_prompt), HumanMessage(content=user_msg)]
            ):
                text = getattr(chunk, "content", "") or ""
                if not isinstance(text, str):
                    text = str(text)
                if text:
                    accumulated += text
                    yield {"event": "chunk", "data": json.dumps({"text": text})}
        except Exception as exc:
            yield {"event": "error", "data": json.dumps({"message": str(exc)})}
            return

        lines = accumulated.splitlines()
        subject = next(
            (l.replace("Subject:", "").strip() for l in lines if l.startswith("Subject:")),
            f"Re: {trigger_kind.replace('_', ' ').title()} — FGF Brands",
        )
        body_md = "\n".join(l for l in lines if not l.startswith("Subject:")).strip()

        draft = NegotiationDraft(
            supplier_id=supplier_id,
            trigger_kind=trigger_kind,
            body_md=body_md,
        )
        db.add(draft)
        await db.flush()

        message_id: str | None = None
        if record_outbound:
            msg = SupplierMessageORM(
                supplier_id=supplier_id,
                direction="outbound",
                channel="agent",
                subject=subject,
                body=body_md,
                author="ProcurementAgent",
                related_negotiation_id=draft.draft_id,
            )
            db.add(msg)
            await db.flush()
            message_id = str(msg.message_id)

        await db.commit()
        await db.refresh(draft)

        yield {
            "event": "done",
            "data": json.dumps(
                {
                    "draft_id": str(draft.draft_id),
                    "proposed_subject": subject,
                    "trigger_kind": trigger_kind,
                    "message_id": message_id,
                    "body_md": body_md,
                }
            ),
        }

    return EventSourceResponse(stream())


@router.get("/{supplier_id}/moq_tax", response_model=list[MOQTaxEntry])
async def moq_tax_ledger(
    supplier_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[MOQTaxEntry]:
    if not await db.get(SupplierORM, supplier_id):
        raise HTTPException(404, f"supplier {supplier_id} not found")
    entries = (
        await db.execute(
            select(MoqTaxEntry)
            .where(MoqTaxEntry.supplier_id == supplier_id)
            .order_by(MoqTaxEntry.recorded_at.desc())
        )
    ).scalars().all()
    return [
        MOQTaxEntry(
            supplier_id=e.supplier_id,
            quarter=e.quarter,
            overage_kg=float(e.overage_kg),
            holding_cost_usd=float(e.holding_cost),
            recorded_at=e.recorded_at.isoformat(),
        )
        for e in entries
    ]
