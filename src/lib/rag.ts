import { readFile, stat } from "fs/promises";
import path from "path";

const DEFAULT_EMBED_FILE =
  process.env.RAG_EMBED_FILE ?? path.resolve(process.cwd(), "data/embeddings.json");
const DEFAULT_EMBED_MODEL = process.env.RAG_EMBED_MODEL ?? "embeddinggemma:latest";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const CONTEXT_LIMIT = parseInt(process.env.RAG_CONTEXT_LIMIT ?? "3", 10);

type EmbeddingVector = number[];

interface EmbeddingChunk {
  id: string;
  source: string;
  index: number;
  content: string;
  wordCount: number;
  embedding: EmbeddingVector;
}

interface EmbeddingDataset {
  model: string;
  createdAt: string;
  chunks: EmbeddingChunk[];
}

interface RetrievedContext {
  contextText: string;
  references: Array<{
    id: string;
    source: string;
    index: number;
    score: number;
  }>;
}

let cachedDataset: EmbeddingDataset | null = null;
let cachedFileMtime: number | null = null;

export async function buildContextFromEmbeddings(
  query: string,
  limit: number = CONTEXT_LIMIT
): Promise<RetrievedContext> {
  const dataset = await loadDataset();

  if (!dataset || dataset.chunks.length === 0) {
    return { contextText: "", references: [] };
  }

  const queryEmbedding = await embedText(query);

  const scored = dataset.chunks
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .filter(({ score }) => Number.isFinite(score) && score > 0);

  if (scored.length === 0) {
    return { contextText: "", references: [] };
  }

  scored.sort((a, b) => b.score - a.score);

  const top = scored.slice(0, limit);

  const contextText = top
    .map(
      ({ chunk }, idx) =>
        `[ref-${idx + 1}] Source: ${chunk.source}\n${chunk.content}`.trim()
    )
    .join("\n\n");

  const references = top.map(({ chunk, score }) => ({
    id: chunk.id,
    source: chunk.source,
    index: chunk.index,
    score,
  }));

  return { contextText, references };
}

async function loadDataset(): Promise<EmbeddingDataset | null> {
  try {
    const fileStats = await stat(DEFAULT_EMBED_FILE);
    const mtime = fileStats.mtimeMs;

    if (cachedDataset && cachedFileMtime === mtime) {
      return cachedDataset;
    }

    const fileContents = await readFile(DEFAULT_EMBED_FILE, "utf8");
    const parsed: EmbeddingDataset = JSON.parse(fileContents);

    cachedDataset = parsed;
    cachedFileMtime = mtime;
    return parsed;
  } catch (error) {
    cachedDataset = null;
    cachedFileMtime = null;

    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(
        `[rag] Embeddings file not found at ${DEFAULT_EMBED_FILE}. Run "npm run generate:embeddings" first.`
      );
      return null;
    }

    console.error("[rag] Failed to load embeddings:", error);
    return null;
  }
}

async function embedText(text: string): Promise<EmbeddingVector> {
  const response = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_EMBED_MODEL,
      input: [text],
    }),
  });

  if (!response.ok) {
    const errorText = await safeReadText(response);
    throw new Error(
      `Failed to embed query (status ${response.status}): ${errorText}`
    );
  }

  const data = await response.json();
  const vector = data?.embeddings?.[0];

  if (!Array.isArray(vector)) {
    throw new Error("Embedding response missing data for query.");
  }

  return vector;
}

function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i];
    const valB = b[i];
    dot += valA * valB;
    magA += valA * valA;
    magB += valB * valB;
  }

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function safeReadText(response: globalThis.Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<unreadable>";
  }
}

export type { EmbeddingChunk, RetrievedContext };
