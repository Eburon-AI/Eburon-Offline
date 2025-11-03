FROM python:3.10-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    INDEX_TTS_MODEL_ID="theta-voice/index-tts2" \
    INDEX_TTS_MODEL_DIR="/models" \
    INDEX_TTS_VENV="/opt/index-tts"

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN python -m venv "${INDEX_TTS_VENV}" \
    && . "${INDEX_TTS_VENV}/bin/activate" \
    && pip install --upgrade pip \
    && pip install -r requirements.txt

COPY entrypoint.sh .
COPY app.py .

RUN chmod +x entrypoint.sh

VOLUME ["/models", "/reference_audio"]

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
