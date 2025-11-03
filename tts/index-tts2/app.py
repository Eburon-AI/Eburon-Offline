import base64
import os
import shlex
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


app = FastAPI(
    title="IndexTTS2 Service",
    description=(
        "REST gateway for IndexTTS2 voice synthesis. "
        "The actual inference is delegated to the IndexTTS2 CLI specified "
        "via the INDEX_TTS_COMMAND_TEMPLATE environment variable."
    ),
)


class TTSRequest(BaseModel):
    text: str = Field(..., description="Plain text to synthesize.")
    reference_audio: Optional[str] = Field(
        None,
        description="Path to a reference WAV/FLAC file for cloning (mounted into the container).",
    )
    speaker: Optional[str] = Field(
        None,
        description="Optional speaker identifier, if supported by the underlying command.",
    )
    seed: Optional[int] = Field(
        None, description="Optional deterministic seed passed to the CLI template."
    )
    output_format: str = Field(
        "wav",
        description="Output file extension (must be supported by the CLI template).",
    )
    extra: Dict[str, str] = Field(
        default_factory=dict,
        description="Additional template variables passed to the command renderer.",
    )


class SubprocessSynthesizer:
    def __init__(self) -> None:
        template = os.getenv(
            "INDEX_TTS_COMMAND_TEMPLATE",
            (
                "python /models/scripts/infer.py "
                "--text {text} "
                "--output {output} "
                "--reference_audio {reference_audio} "
                "--speaker {speaker} "
                "--seed {seed}"
            ),
        )
        self.template = template
        self.workdir = os.getenv("INDEX_TTS_WORKDIR", "/models")

    def _render_command(self, values: Dict[str, str]) -> str:
        sanitized = {k: shlex.quote(str(v)) if v else "" for k, v in values.items()}
        try:
            command = self.template.format(**sanitized)
        except KeyError as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Missing placeholder '{exc.args[0]}' in INDEX_TTS_COMMAND_TEMPLATE.",
            ) from exc
        return command.strip()

    def synthesize(self, request: TTSRequest) -> bytes:
        with TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / f"output.{request.output_format}"

            template_values: Dict[str, str] = {
                "text": request.text,
                "output": str(output_path),
                "reference_audio": request.reference_audio or "",
                "speaker": request.speaker or "",
                "seed": request.seed if request.seed is not None else "",
            }
            template_values.update(request.extra)

            command = self._render_command(template_values)

            if not command:
                raise HTTPException(
                    status_code=500,
                    detail="Rendered command is empty. Check INDEX_TTS_COMMAND_TEMPLATE.",
                )

            try:
                subprocess.run(
                    command,
                    shell=True,
                    check=True,
                    cwd=self.workdir,
                )
            except subprocess.CalledProcessError as exc:
                raise HTTPException(
                    status_code=500,
                    detail=f"IndexTTS2 command failed (exit code {exc.returncode}).",
                ) from exc

            if not output_path.exists():
                raise HTTPException(
                    status_code=500,
                    detail=f"Expected audio file not found at {output_path}",
                )

            return output_path.read_bytes()


handler = SubprocessSynthesizer()


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/synthesize")
def synthesize(request: TTSRequest) -> Dict[str, str]:
    audio_bytes = handler.synthesize(request)
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    return {
        "audio_base64": audio_b64,
        "format": request.output_format,
        "bytes": len(audio_bytes),
    }
