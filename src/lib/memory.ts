import { query } from "./db";
import { v4 as uuidv4 } from "uuid";

export interface ChatMemoryRecord {
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface MemoryContext {
  shortTerm: ChatMemoryRecord[];
  longTermSummary: string | null;
}

export async function ensureSession(sessionId: string, userName?: string) {
  await query(
    `
    INSERT INTO chat_sessions (id, user_name)
    VALUES ($1, $2)
    ON CONFLICT (id)
    DO UPDATE SET user_name = COALESCE(chat_sessions.user_name, EXCLUDED.user_name)
    `,
    [sessionId, userName ?? null]
  );
}

export async function appendMessage(
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string
) {
  const messageId = uuidv4();
  await query(
    `
    INSERT INTO chat_messages (id, session_id, role, content)
    VALUES ($1, $2, $3, $4)
    `,
    [messageId, sessionId, role, content]
  );
}

export async function getRecentMessages(
  sessionId: string,
  limit = 8
): Promise<ChatMemoryRecord[]> {
  const result = await query<ChatMemoryRecord>(
    `
    SELECT role, content, created_at
    FROM chat_messages
    WHERE session_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [sessionId, limit]
  );

  return result.rows.reverse();
}

export async function getLongTermSummary(sessionId: string): Promise<string | null> {
  const result = await query<{ summary: string }>(
    `
    SELECT summary
    FROM chat_longterm_memory
    WHERE session_id = $1
    LIMIT 1
    `,
    [sessionId]
  );

  return result.rows[0]?.summary ?? null;
}

export async function upsertLongTermSummary(sessionId: string, summary: string) {
  const memoryId = uuidv4();
  await query(
    `
    INSERT INTO chat_longterm_memory (id, session_id, summary)
    VALUES ($1, $2, $3)
    ON CONFLICT (session_id)
    DO UPDATE SET summary = EXCLUDED.summary, updated_at = NOW()
    `,
    [memoryId, sessionId, summary]
  );
}

export async function buildMemoryContext(
  sessionId: string,
  limit = 8
): Promise<MemoryContext> {
  const [recentMessages, longTermSummary] = await Promise.all([
    getRecentMessages(sessionId, limit),
    getLongTermSummary(sessionId),
  ]);

  return {
    shortTerm: recentMessages,
    longTermSummary,
  };
}
