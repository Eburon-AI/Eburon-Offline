FROM node:20-bullseye AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

ARG OLLAMA_URL=http://127.0.0.1:11434
ENV OLLAMA_URL=${OLLAMA_URL}

COPY . .

RUN npm run build

FROM node:20-bullseye

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates procps \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://ollama.com/install.sh | sh

ENV OLLAMA_HOST=0.0.0.0
ENV OLLAMA_URL=http://localhost:11434
ENV OLLAMA_MODELS=/var/lib/ollama
ENV PORT=3000

RUN /bin/sh -c "\
  ollama serve & \
  until curl -sf http://localhost:11434/api/version >/dev/null; do sleep 1; done && \
  ollama pull gpt-oss && \
  ollama pull gemma3:1b && \
  ollama pull eburon/eburon && \
  pkill ollama \
"

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000 11434

CMD ["/bin/sh", "-c", "ollama serve & npm start"]
