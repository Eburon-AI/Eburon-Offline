#!/usr/bin/env node

/**
 * Generates document embeddings using Ollama's embedding API and writes them
 * to `data/embeddings.json`. Documents are sourced from `data/documents` by
 * default. Configure paths via environment variables:
 *
 *   RAG_SOURCE_DIR   - relative/absolute path to the document folder
 *   RAG_OUTPUT_FILE  - relative/absolute path for the embeddings file
 *   RAG_EMBED_MODEL  - embedding model to use (default: embeddinggemma:latest)
 *   OLLAMA_URL       - Ollama base URL (default: http://127.0.0.1:11434)
 *
 * Chunking is performed using a sliding window over words to create segments
 * of manageable size for the embedding model.
 */

import { promises as fs } from "fs";
import path from "path";
import process from "process";

const cwd = process.cwd();
const docsDir = resolvePath(process.env.RAG_SOURCE_DIR ?? "data/documents");
const outputFile = resolvePath(process.env.RAG_OUTPUT_FILE ?? "data/embeddings.json");
const embeddingModel = process.env.RAG_EMBED_MODEL ?? "embeddinggemma:latest";
const ollamaUrl = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";

const MAX_WORDS = parseInt(process.env.RAG_CHUNK_WORDS ?? "400", 10);
const OVERLAP_WORDS = parseInt(process.env.RAG_CHUNK_OVERLAP ?? "80", 10);
const BATCH_SIZE = parseInt(process.env.RAG_EMBED_BATCH ?? "16", 10);

async function main() {
  await ensureDirExists(path.dirname(outputFile));

  const files = await collectFiles(docsDir);
  if (files.length === 0) {
    await writeOutput({
      model: embeddingModel,
      createdAt: new Date().toISOString(),
      chunks: [],
    });
    console.log(`[rag] No source documents found in ${docsDir}. Wrote empty embeddings file.`);
    return;
  }

  console.log(`[rag] Found ${files.length} source file(s). Chunking content...`);

  const chunks = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const relativePath = path.relative(cwd, filePath);
    const fileChunks = chunkText(content, {
      maxWords: MAX_WORDS,
      overlapWords: OVERLAP_WORDS,
      source: relativePath,
    });

    for (const chunk of fileChunks) {
      chunks.push(chunk);
    }
  }

  if (chunks.length === 0) {
    await writeOutput({
      model: embeddingModel,
      createdAt: new Date().toISOString(),
      chunks: [],
    });
    console.log("[rag] Documents exist but produced zero chunks. Check chunking thresholds.");
    return;
  }

  console.log(`[rag] Created ${chunks.length} chunk(s). Generating embeddings using ${embeddingModel}...`);

  const embeddings = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const vectors = await embedBatch(batch.map((item) => item.content));

    vectors.forEach((vector, index) => {
      embeddings.push({
        ...chunks[i + index],
        embedding: vector,
      });
    });

    console.log(
      `[rag] Embedded chunks ${i + 1}-${Math.min(i + BATCH_SIZE, chunks.length)} / ${chunks.length}`
    );
  }

  await writeOutput({
    model: embeddingModel,
    createdAt: new Date().toISOString(),
    chunks: embeddings,
  });

  console.log(`[rag] Wrote embeddings for ${embeddings.length} chunk(s) to ${outputFile}`);
}

async function embedBatch(inputs) {
  const response = await fetch(`${ollamaUrl}/api/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: embeddingModel,
      input: inputs,
    }),
  });

  if (!response.ok) {
    const errorText = await safeReadText(response);
    throw new Error(
      `Failed to generate embeddings (status ${response.status}): ${errorText}`
    );
  }

  const data = await response.json();
  if (!data?.embeddings) {
    throw new Error("Embedding response missing 'embeddings' field.");
  }

  return data.embeddings;
}

function chunkText(text, { maxWords, overlapWords, source }) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ");
  if (words.length <= maxWords) {
    return [
      {
        id: `${source}#0`,
        source,
        index: 0,
        content: normalized,
        wordCount: words.length,
      },
    ];
  }

  const chunks = [];
  let start = 0;
  let index = 0;

  while (start < words.length) {
    const end = Math.min(start + maxWords, words.length);
    const chunkWords = words.slice(start, end);
    const chunkText = chunkWords.join(" ");

    chunks.push({
      id: `${source}#${index}`,
      source,
      index,
      content: chunkText,
      wordCount: chunkWords.length,
    });

    if (end === words.length) {
      break;
    }

    start = Math.max(0, end - overlapWords);
    index += 1;
  }

  return chunks;
}

async function collectFiles(dir) {
  const items = await safeReadDir(dir);
  const files = [];

  for (const item of items) {
    const absolutePath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name.startsWith(".")) continue;
      const nested = await collectFiles(absolutePath);
      files.push(...nested);
    } else if (isTextFile(item.name)) {
      files.push(absolutePath);
    }
  }

  return files;
}

function isTextFile(filename) {
  const lower = filename.toLowerCase();
  return [".txt", ".md", ".mdx", ".rst", ".csv", ".json"].some((ext) =>
    lower.endsWith(ext)
  );
}

async function ensureDirExists(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
}

function resolvePath(relativeOrAbsolute) {
  return path.isAbsolute(relativeOrAbsolute)
    ? relativeOrAbsolute
    : path.resolve(cwd, relativeOrAbsolute);
}

async function safeReadDir(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeOutput(payload) {
  const json = JSON.stringify(payload, null, 2);
  await fs.writeFile(outputFile, json);
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return "<unreadable>";
  }
}

main().catch((error) => {
  console.error("[rag] Embedding build failed:", error);
  process.exitCode = 1;
});
