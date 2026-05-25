from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import AsyncIterator

from deepgram import (
    DeepgramClient,
    DeepgramClientOptions,
    LiveOptions,
    LiveTranscriptionEvents,
    PrerecordedOptions,
)

from agent.config import DEEPGRAM_API_KEY, DEEPGRAM_MODEL

_BAKERY_KEYWORDS = [
    "blueberries:2",
    "allergen:2",
    "changeover:2",
    "MOQ:2",
    "landed cost:1.5",
    "sesame:2",
    "gluten:2",
    "dairy:2",
    "croissant:1.5",
    "naan:1.5",
    "lemon poppy:1.5",
    "FEFO:2",
    "pallet:1.5",
    "spoilage:2",
    "lot ID:2",
    "Plant 1:1.5",
    "Plant 2:1.5",
    "Plant 3:1.5",
    "Plant 4:1.5",
    "Maple Grain:1.5",
    "Prairie Berry:1.5",
]


@dataclass
class TranscriptResult:
    transcript: str
    confidence: float
    words: list[dict]
    is_final: bool


def _make_client() -> DeepgramClient:
    return DeepgramClient(
        DEEPGRAM_API_KEY,
        config=DeepgramClientOptions(verbose=False),
    )


def transcribe_file(audio_bytes: bytes, mimetype: str = "audio/wav") -> TranscriptResult:
    """Transcribe a complete audio file (blocking). Uses Nova-3 with bakery vocabulary."""
    client = _make_client()

    options = PrerecordedOptions(
        model=DEEPGRAM_MODEL,
        smart_format=True,
        punctuate=True,
        utterances=True,
        keywords=_BAKERY_KEYWORDS,
        language="en",
    )

    source = {"buffer": audio_bytes, "mimetype": mimetype}
    response = client.listen.rest.v("1").transcribe_file(source, options)

    channel = response.results.channels[0]
    alt = channel.alternatives[0]
    return TranscriptResult(
        transcript=alt.transcript,
        confidence=alt.confidence,
        words=[w.to_dict() for w in (alt.words or [])],
        is_final=True,
    )


async def stream_live(
    audio_stream: AsyncIterator[bytes],
    mimetype: str = "audio/webm",
    encoding: str = "opus",
    sample_rate: int = 16000,
) -> AsyncIterator[TranscriptResult]:
    """Stream live audio through Deepgram and yield incremental transcripts."""
    client = _make_client()

    options = LiveOptions(
        model=DEEPGRAM_MODEL,
        smart_format=True,
        punctuate=True,
        interim_results=True,
        utterance_end_ms="1000",
        vad_events=True,
        keywords=_BAKERY_KEYWORDS,
        language="en",
        encoding=encoding,
        sample_rate=sample_rate,
    )

    results: asyncio.Queue[TranscriptResult | None] = asyncio.Queue()

    connection = client.listen.asyncwebsocket.v("1")

    async def on_message(self, result, **kwargs):
        sentence = result.channel.alternatives[0].transcript
        if sentence:
            await results.put(
                TranscriptResult(
                    transcript=sentence,
                    confidence=result.channel.alternatives[0].confidence,
                    words=[],
                    is_final=result.is_final,
                )
            )

    async def on_close(self, close, **kwargs):
        await results.put(None)

    connection.on(LiveTranscriptionEvents.Transcript, on_message)
    connection.on(LiveTranscriptionEvents.Close, on_close)

    await connection.start(options)

    async def _send():
        async for chunk in audio_stream:
            await connection.send(chunk)
        await connection.finish()

    asyncio.ensure_future(_send())

    while True:
        item = await results.get()
        if item is None:
            break
        yield item
