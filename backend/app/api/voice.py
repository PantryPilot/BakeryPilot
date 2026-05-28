"""Voice router: audio upload → Deepgram transcription → verification routing."""

from datetime import datetime

import httpx
from fastapi import APIRouter, HTTPException, UploadFile

from app.config import settings

router = APIRouter(prefix="/api/voice", tags=["voice"])

_DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"
_DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant"


@router.post("/realtime_token")
async def realtime_token() -> dict:
    """Return a Deepgram access token for the browser to open a streaming
    WebSocket. Prefers a short-lived scoped token from /v1/auth/grant; if
    the master key lacks the keys:write permission needed for grant, falls
    back to returning the master key (acceptable for local/demo use only)."""
    api_key = (settings.deepgram_api_key or "").strip()
    if not api_key:
        raise HTTPException(503, "Deepgram is not configured (DEEPGRAM_API_KEY missing)")

    model = settings.deepgram_model or "nova-3"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _DEEPGRAM_GRANT_URL,
                headers={"Authorization": f"Token {api_key}"},
            )
        if resp.status_code == 200:
            data = resp.json()
            return {
                "access_token": data.get("access_token"),
                "expires_in": data.get("expires_in"),
                "model": model,
                "kind": "scoped",
            }
    except httpx.HTTPError:
        pass  # fall through to master-key fallback

    # Fallback: master key. Browser uses it as the WS subprotocol header.
    return {
        "access_token": api_key,
        "expires_in": None,
        "model": model,
        "kind": "master",
    }


def _route_verification(transcript: str) -> str:
    """Map the transcript content to one of the 4 verification levels.

    1 auto_commit       — small routine delta
    2 peer_verify       — mid-range or moderately critical
    3 supervisor_approve — large delta or allergen-class ingredient
    4 dual_sign_off     — crosses financial / safety threshold
    """
    t = transcript.lower()
    if any(kw in t for kw in ("written off", "write off", "discard", "spoiled", "expired", "rejected")):
        return "dual_sign_off"
    if any(kw in t for kw in ("allergen", "sesame", "peanut", "gluten", "tree nut")):
        return "supervisor_approve"
    if any(kw in t for kw in ("at receiving", "received", "intake", "shortfall", "transfer")):
        return "peer_verify"
    return "auto_commit"


@router.post("/upload")
async def upload_audio(file: UploadFile) -> dict:
    """Forward the uploaded audio to Deepgram and return the transcription
    along with a routed verification level."""
    api_key = (settings.deepgram_api_key or "").strip()
    if not api_key:
        raise HTTPException(503, "Deepgram is not configured (DEEPGRAM_API_KEY missing)")

    content = await file.read()
    if not content:
        raise HTTPException(400, "empty audio upload")

    params = {
        "model": settings.deepgram_model or "nova-3",
        "smart_format": "true",
        "punctuate": "true",
        "diarize": "false",
        "language": "en",
    }
    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": file.content_type or "audio/webm",
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(_DEEPGRAM_URL, params=params, headers=headers, content=content)
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"deepgram request failed: {exc}") from exc

    if resp.status_code != 200:
        raise HTTPException(502, f"deepgram returned {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    try:
        alt = data["results"]["channels"][0]["alternatives"][0]
        transcript = (alt.get("transcript") or "").strip()
        confidence = float(alt.get("confidence") or 0.0)
    except (KeyError, IndexError, TypeError):
        transcript = ""
        confidence = 0.0

    return {
        "transcription": transcript,
        "verification_level": _route_verification(transcript) if transcript else "auto_commit",
        "confidence": confidence,
        "received_at": datetime.utcnow().isoformat(),
        "audio_bytes": len(content),
        "model": settings.deepgram_model or "nova-3",
    }
