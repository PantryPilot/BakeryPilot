"""Voice router: audio upload, faster-whisper transcription (mock), verification routing."""

from datetime import datetime

from fastapi import APIRouter, UploadFile

router = APIRouter(prefix="/api/voice", tags=["voice"])


@router.post("/upload")
async def upload_audio(file: UploadFile) -> dict:
    """Mock: returns a parsed inventory delta + verification level routing.

    The 4-level verification hierarchy is:
      1 auto_commit -- small routine delta
      2 peer_verify -- mid-range or moderately critical
      3 supervisor_approve -- large delta or allergen-class ingredient
      4 dual_sign_off -- crosses financial/safety threshold
    """
    content = await file.read()
    size = len(content)

    transcription = "Bulk flour top-up 5 kg"
    level = "auto_commit"
    if size > 100_000:
        transcription = "Sesame, full bin written off"
        level = "dual_sign_off"
    elif size > 50_000:
        transcription = "Blueberries, 24 kg at receiving"
        level = "peer_verify"

    return {
        "transcription": transcription,
        "verification_level": level,
        "confidence": 0.91,
        "received_at": datetime.utcnow().isoformat(),
        "audio_bytes": size,
    }
