#!/usr/bin/env bash
set -euo pipefail

# Activate virtualenv
. "${INDEX_TTS_VENV}/bin/activate"

if [[ -n "${INDEX_TTS_MODEL_ID:-}" ]]; then
  python - <<'PY'
import os
from huggingface_hub import snapshot_download

model_id = os.environ["INDEX_TTS_MODEL_ID"]
target_dir = os.environ.get("INDEX_TTS_MODEL_DIR", "/models")
token = os.environ.get("HF_TOKEN")

print(f"[index-tts2] Ensuring model '{model_id}' is available in '{target_dir}'...")
snapshot_download(
    repo_id=model_id,
    local_dir=target_dir,
    local_dir_use_symlinks=False,
    token=token,
)
print("[index-tts2] Model download complete.")
PY
fi

exec uvicorn app:app --host 0.0.0.0 --port 8000
