# eburonapp-ui

Fully packaged Eburon chat UI with Ollama models, RAG-enhanced PostgreSQL memory, and image OCR. Deploy everything with a single pasted command.

## 🚀 One-Paste Deploy

```bash
curl -fsSL https://get.docker.com | sh && \
  docker compose up -d postgres && \
  docker build -t eburonapp-ui . && \
  docker run --name eburonapp-ui --restart unless-stopped \
    --network ui-master_default \
    -d -p 3000:3000 -p 11434:11434 \
    -e EBURON_URL=http://localhost:11434 \
    -e DATABASE_URL=postgresql://eburon:eburon@postgres:5432/eburon_chat \
    eburonapp-ui
```

What this does:
1. Installs Docker if it isn’t already present.
2. Starts the bundled PostgreSQL service defined in `docker-compose.yml` (auto-seeded with the chat memory schema).
3. Builds the Next.js + Ollama image (Gemma 3 1B, GPT-OSS, and Eburon models are pre-pulled).
4. Runs the UI container, exposing:
   - Web UI at **http://localhost:3000**
   - Ollama API at **http://localhost:11434**

> Need to rebuild? Stop the container with `docker stop eburonapp-ui` and remove it with `docker rm eburonapp-ui` before re-running the deploy command.

## 🛠 Environment Defaults

| Variable | Value |
| --- | --- |
| `EBURON_URL` | `http://localhost:11434` |
| `DATABASE_URL` | `postgresql://eburon:eburon@postgres:5432/eburon_chat` |

> `EBURON_URL` is mirrored to `OLLAMA_URL` inside the Docker image, so you only need to set `EBURON_URL`.

Adjust or override these if you host services elsewhere.

## 🖼 Screenshot

![Screenshot of the interface](./public/Screenshot%202025-11-04%20at%205.02.27%E2%80%AFAM.png)
