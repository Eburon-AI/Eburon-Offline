import { NextResponse } from "next/server";
import {
  appendMessage,
  ensureSession,
  upsertLongTermSummary,
} from "@/lib/memory";

interface HistoryMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      chatId,
      role = "assistant",
      content,
      history,
      userName,
    } = body as {
      chatId?: string;
      role?: "user" | "assistant" | "system";
      content?: string;
      history?: HistoryMessage[];
      userName?: string;
    };

    if (!chatId || !content) {
      return NextResponse.json(
        { error: "chatId and content are required." },
        { status: 400 }
      );
    }

    await ensureSession(chatId, userName);
    await appendMessage(chatId, role ?? "assistant", content);

    if (Array.isArray(history) && history.length > 0) {
      const summary = buildSummary(history);
      if (summary) {
        await upsertLongTermSummary(chatId, summary);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[memory] Failed to persist assistant message:", error);
    return NextResponse.json(
      { error: "Failed to persist memory." },
      { status: 500 }
    );
  }
}

function buildSummary(history: HistoryMessage[]): string | null {
  const trimmed = history
    .filter((msg) => msg.role === "user" || msg.role === "assistant")
    .slice(-12);

  if (trimmed.length === 0) return null;

  const summaryLines: string[] = trimmed.map((msg) => {
    const label = msg.role === "user" ? "User" : "Assistant";
    return `${label}: ${truncate(msg.content.trim(), 220)}`;
  });

  const summary = summaryLines.join(" | ");
  return truncate(summary, 1500);
}

function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input;
  return input.slice(0, maxLength - 3) + "...";
}
