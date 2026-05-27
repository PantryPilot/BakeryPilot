"""Current-user profile + persisted settings.

Hackathon build has no auth, so we use a single fixed `demo_user` id everywhere.
Both endpoints fall back to in-memory defaults if the new tables don't exist
(graceful for older Postgres volumes where `make schema.migrate` hasn't been
run yet).
"""

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AppUser, UserSettings
from app.db.session import get_db

router = APIRouter(prefix="/api/users", tags=["users"])

DEMO_USER_ID = "demo_user"

# Built-in fallback so the UI never breaks even when the tables are missing.
_FALLBACK_USER = {
    "user_id": DEMO_USER_ID,
    "display_name": "Alex Chen",
    "role": "Ops Manager",
    "email": "alex.chen@fgfbrands.com",
    "default_facility_id": "plant-toronto",
}

_FALLBACK_SETTINGS = {
    "user_id": DEMO_USER_ID,
    "theme": "light",
    "accent": "blue",
    "notif_toast": True,
    "notif_auto_dismiss": True,
    "notif_expiring_lots": True,
    "notif_supplier_risk": True,
    "notif_yield_anomaly": False,
}

ThemeMode = Literal["dark", "light"]
AccentColor = Literal["blue", "emerald", "violet", "amber", "teal", "indigo"]


class UserProfile(BaseModel):
    user_id: str
    display_name: str
    role: str
    email: str
    default_facility_id: str | None = None


class UserProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    role: str | None = Field(default=None, min_length=1, max_length=120)
    default_facility_id: str | None = None


class UserSettingsModel(BaseModel):
    user_id: str
    theme: ThemeMode = "light"
    accent: AccentColor = "blue"
    notif_toast: bool = True
    notif_auto_dismiss: bool = True
    notif_expiring_lots: bool = True
    notif_supplier_risk: bool = True
    notif_yield_anomaly: bool = False


class UserSettingsUpdate(BaseModel):
    theme: ThemeMode | None = None
    accent: AccentColor | None = None
    notif_toast: bool | None = None
    notif_auto_dismiss: bool | None = None
    notif_expiring_lots: bool | None = None
    notif_supplier_risk: bool | None = None
    notif_yield_anomaly: bool | None = None


def _user_to_model(u: AppUser) -> UserProfile:
    return UserProfile(
        user_id=u.user_id,
        display_name=u.display_name,
        role=u.role,
        email=u.email,
        default_facility_id=u.default_facility_id,
    )


def _settings_to_model(s: UserSettings) -> UserSettingsModel:
    return UserSettingsModel(
        user_id=s.user_id,
        theme=s.theme,  # type: ignore[arg-type]
        accent=s.accent,  # type: ignore[arg-type]
        notif_toast=s.notif_toast,
        notif_auto_dismiss=s.notif_auto_dismiss,
        notif_expiring_lots=s.notif_expiring_lots,
        notif_supplier_risk=s.notif_supplier_risk,
        notif_yield_anomaly=s.notif_yield_anomaly,
    )


@router.get("/me", response_model=UserProfile)
async def get_current_user(db: AsyncSession = Depends(get_db)) -> UserProfile:
    try:
        user = await db.get(AppUser, DEMO_USER_ID)
    except ProgrammingError:
        await db.rollback()
        return UserProfile(**_FALLBACK_USER)

    if not user:
        return UserProfile(**_FALLBACK_USER)
    return _user_to_model(user)


@router.put("/me", response_model=UserProfile)
async def update_current_user(
    req: UserProfileUpdate, db: AsyncSession = Depends(get_db)
) -> UserProfile:
    try:
        user = await db.get(AppUser, DEMO_USER_ID)
    except ProgrammingError:
        await db.rollback()
        raise HTTPException(
            503,
            "app_users table not initialised. Run `make schema.migrate && make schema.seed`.",
        )

    if not user:
        # Auto-create from fallback so PUT on a partially-migrated DB still works.
        user = AppUser(
            user_id=DEMO_USER_ID,
            display_name=_FALLBACK_USER["display_name"],
            role=_FALLBACK_USER["role"],
            email=_FALLBACK_USER["email"],
            default_facility_id=_FALLBACK_USER["default_facility_id"],
        )
        db.add(user)
        await db.flush()

    if req.display_name is not None:
        user.display_name = req.display_name
    if req.role is not None:
        user.role = req.role
    if req.default_facility_id is not None:
        user.default_facility_id = req.default_facility_id
    user.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(user)
    return _user_to_model(user)


@router.get("/me/settings", response_model=UserSettingsModel)
async def get_user_settings(db: AsyncSession = Depends(get_db)) -> UserSettingsModel:
    try:
        settings = await db.get(UserSettings, DEMO_USER_ID)
    except ProgrammingError:
        await db.rollback()
        return UserSettingsModel(**_FALLBACK_SETTINGS)

    if not settings:
        return UserSettingsModel(**_FALLBACK_SETTINGS)
    return _settings_to_model(settings)


@router.put("/me/settings", response_model=UserSettingsModel)
async def update_user_settings(
    req: UserSettingsUpdate, db: AsyncSession = Depends(get_db)
) -> UserSettingsModel:
    try:
        settings = await db.get(UserSettings, DEMO_USER_ID)
    except ProgrammingError:
        await db.rollback()
        raise HTTPException(
            503,
            "user_settings table not initialised. Run `make schema.migrate && make schema.seed`.",
        )

    if not settings:
        # Ensure the parent row exists before inserting settings (FK guard).
        user = await db.get(AppUser, DEMO_USER_ID)
        if not user:
            db.add(AppUser(
                user_id=DEMO_USER_ID,
                display_name=_FALLBACK_USER["display_name"],
                role=_FALLBACK_USER["role"],
                email=_FALLBACK_USER["email"],
                default_facility_id=_FALLBACK_USER["default_facility_id"],
            ))
            await db.flush()
        settings = UserSettings(user_id=DEMO_USER_ID)
        db.add(settings)
        await db.flush()

    payload = req.model_dump(exclude_none=True)
    for key, value in payload.items():
        setattr(settings, key, value)
    settings.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(settings)
    return _settings_to_model(settings)
