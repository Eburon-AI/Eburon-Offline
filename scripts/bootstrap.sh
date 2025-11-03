#!/usr/bin/env bash

set -euo pipefail

REPO_URL="https://github.com/Eburon-AI/Eburon-Offline.git"
CHECKOUT_DIR="${HOME}/Eburon-Offline"
IMAGE_NAME="eburon-offline"
CONTAINER_NAME="eburon-offline"
DEFAULT_PROJECT_NAME="eburon-offline"

info() {
  printf '\033[1;34m[INFO]\033[0m %s\n' "$*"
}

warn() {
  printf '\033[1;33m[WARN]\033[0m %s\n' "$*"
}

error() {
  printf '\033[1;31m[ERROR]\033[0m %s\n' "$*"
  exit 1
}

ensure_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "'$1' is required but was not found in PATH."
  fi
}

# --- sanity checks ---------------------------------------------------------
ensure_command curl
ensure_command git
ensure_command docker

if command -v docker compose >/dev/null 2>&1; then
  DOCKER_COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE="docker-compose"
else
  error "Docker Compose is required (docker compose or docker-compose)."
fi

# --- Ollama installation & model pulls ------------------------------------
if ! command -v ollama >/dev/null 2>&1; then
  info "Installing Ollama..."
  curl -fsSL https://ollama.com/install.sh | sh
  info "Ollama installed. You may need to log out and back in if PATH was modified."
fi

# Ensure an Ollama daemon is running when pulling models
OLLAMA_TMP_PID=""
if ! curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  info "Starting temporary Ollama server for model pulls..."
  ollama serve >/tmp/eburonapp-ollama.log 2>&1 &
  OLLAMA_TMP_PID=$!
  # allow server time to boot
  sleep 5
fi

MODELS=(
  "eburon/eburon"
  "gemma3:1b"
  "gpt-oss"
)

for model in "${MODELS[@]}"; do
  info "Pulling model '${model}'..."
  ollama pull "${model}"
done

# Stop temporary daemon if we started one
if [[ -n "${OLLAMA_TMP_PID}" ]]; then
  info "Stopping temporary Ollama server..."
  kill "${OLLAMA_TMP_PID}" >/dev/null 2>&1 || true
  wait "${OLLAMA_TMP_PID}" >/dev/null 2>&1 || true
fi

# --- source checkout -------------------------------------------------------
if [[ -d "${CHECKOUT_DIR}/.git" ]]; then
  info "Updating existing repository at ${CHECKOUT_DIR}..."
  git -C "${CHECKOUT_DIR}" pull --ff-only
else
  info "Cloning repository into ${CHECKOUT_DIR}..."
  git clone "${REPO_URL}" "${CHECKOUT_DIR}"
fi

cd "${CHECKOUT_DIR}"

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-${DEFAULT_PROJECT_NAME}}"
export COMPOSE_PROJECT_NAME

# --- infrastructure: postgres ---------------------------------------------
info "Starting PostgreSQL (Docker Compose)..."
${DOCKER_COMPOSE} up -d postgres

NETWORK_NAME="${COMPOSE_PROJECT_NAME}_default"

# --- build & run UI container ----------------------------------------------
info "Building Docker image (${IMAGE_NAME})..."
docker build -t "${IMAGE_NAME}" .

info "Removing any existing container named ${CONTAINER_NAME}..."
docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

info "Launching UI container..."
docker run --name "${CONTAINER_NAME}" --restart unless-stopped \
  --network "${NETWORK_NAME}" \
  -d -p 3000:3000 -p 11434:11434 \
  -e EBURON_URL=http://localhost:11434 \
  -e DATABASE_URL=postgresql://eburon:eburon@postgres:5432/eburon_chat \
  "${IMAGE_NAME}"

# --- done ------------------------------------------------------------------
cat <<EOF

\033[1;32mAll set!\033[0m
- Web UI:        http://localhost:3000
- Ollama API:    http://localhost:11434
- Ollama models: eburon/eburon, gemma3:1b, gpt-oss (pre-pulled locally and inside the container image)
- PostgreSQL:    running via Docker Compose service 'postgres'

Next steps:
  • Visit the UI at http://localhost:3000
  • To stop the stack:    docker stop ${CONTAINER_NAME}
  • To remove everything: docker rm -f ${CONTAINER_NAME} && ${DOCKER_COMPOSE} down

EOF
