# Eburon

Fully packaged Eburon chat UI with Ollama models, RAG-enhanced PostgreSQL memory, and image OCR. Deploy everything with a single pasted command.

## ⚡️ Zero-Setup Bootstrap

Installs Ollama (if needed), pulls the required models, clones this repo, builds the Docker image, and launches the UI / PostgreSQL stack in one shot:

```bash
curl -fsSL https://raw.githubusercontent.com/Eburon-AI/Eburon-Offline/main/scripts/bootstrap.sh | bash
```

Requirements: `curl`, `git`, and Docker/Compose must already be available on the machine.
> macOS heads-up:
> - Install [Homebrew](https://brew.sh/) (run `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`) and [Docker Desktop](https://www.docker.com/products/docker-desktop) first.
>   - If you prefer Homebrew, `brew install --cask docker` installs Docker Desktop.
> - Install Ollama manually from https://ollama.com/download before running the bootstrap command (the script will exit if Ollama is missing).

## 🚀 One-Paste Deploy

```bash
curl -fsSL https://get.docker.com | sh && \
  docker compose up -d postgres && \
  docker build -t eburon-offline . && \
  docker run --name eburon-offline --restart unless-stopped \
    --network eburon-offline_default \
    -d -p 3000:3000 -p 11434:11434 \
    -e EBURON_URL=http://localhost:11434 \
    -e DATABASE_URL=postgresql://eburon:eburon@postgres:5432/eburon_chat \
    eburon-offline
```

What this does:
1. Installs Docker if it isn’t already present.
2. Starts the bundled PostgreSQL service defined in `docker-compose.yml` (auto-seeded with the chat memory schema).
3. Builds the Next.js + Ollama image (Gemma 3 1B, GPT-OSS, and Eburon models are pre-pulled).
4. Runs the UI container, exposing:
   - Web UI at **http://localhost:3000**
   - Ollama API at **http://localhost:11434**

> Need to rebuild? Stop the container with `docker stop eburon-offline` and remove it with `docker rm eburon-offline` before re-running the deploy command.

## 🛠 Environment Defaults

| Variable | Value |
| --- | --- |
| `EBURON_URL` | `http://localhost:11434` |
| `DATABASE_URL` | `postgresql://eburon:eburon@postgres:5432/eburon_chat` |

Adjust or override these if you host services elsewhere.

## 🖼 Screenshot

![Screenshot of the interface](./public/Screenshot%202025-11-04%20at%205.02.27%E2%80%AFAM.png)
