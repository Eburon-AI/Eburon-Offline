import { createOllama } from "ollama-ai-provider";
import {
  streamText,
  convertToCoreMessages,
  CoreMessage,
  UserContent,
} from "ai";
import { buildContextFromEmbeddings } from "@/lib/rag";
import {
  appendMessage,
  buildMemoryContext,
  ensureSession,
} from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Destructure request data
  const { messages, selectedModel, data, chatId, userName } = await req.json();

  const ollamaUrl = process.env.OLLAMA_URL;

  const initialMessages = messages.slice(0, -1);
  const currentMessage = messages[messages.length - 1];

  const ollama = createOllama({ baseURL: ollamaUrl + "/api" });

  // Build message content array directly
  const messageContent: UserContent = [
    { type: "text", text: currentMessage.content },
  ];

  if (chatId) {
    try {
      await ensureSession(chatId, userName);
      await appendMessage(chatId, "user", currentMessage.content);
    } catch (error) {
      console.error("[memory] Failed to persist user message:", error);
    }
  }

  // Add images if they exist
  data?.images?.forEach((imageUrl: string) => {
    const image = new URL(imageUrl);
    messageContent.push({ type: "image", image });
  });

  const contextMessages: CoreMessage[] = [];

  if (data?.images?.length) {
    contextMessages.push({
      role: "system",
      content: [
        {
          type: "text",
          text: [
            "One or more images were supplied.",
            "Extract any visible text (OCR) and describe important visual details before answering.",
            "If no text is detected, mention that explicitly.",
          ].join(" "),
        },
      ],
    });
  }

  try {
    const { contextText } = await buildContextFromEmbeddings(
      currentMessage.content
    );

    if (contextText) {
      contextMessages.push({
        role: "system",
        content: [
          {
            type: "text",
            text: [
              "Use the following context snippets when relevant. ",
              "Cite references in brackets like [ref-1].",
              "",
              contextText,
            ].join("\n"),
          },
        ],
      });
    }
  } catch (error) {
    console.error("[rag] Failed to build retrieval context:", error);
  }

  if (chatId) {
    try {
      const memoryContext = await buildMemoryContext(chatId);
      const memoryLines: string[] = [];

      if (memoryContext.longTermSummary) {
        memoryLines.push(
          `Long-term summary: ${memoryContext.longTermSummary.trim()}`
        );
      }

      if (memoryContext.shortTerm.length > 0) {
        memoryLines.push("Recent exchanges:");
        memoryContext.shortTerm.forEach((record) => {
          memoryLines.push(
            `- ${record.role.toUpperCase()}: ${record.content.trim()}`
          );
        });
      }

      if (memoryLines.length > 0) {
        contextMessages.push({
          role: "system",
          content: [
            {
              type: "text",
              text: [
                "Consider the stored conversation memory below when generating your response.",
                ...memoryLines,
              ].join("\n"),
            },
          ],
        });
      }
    } catch (error) {
      console.error("[memory] Failed to build memory context:", error);
    }
  }

  // Stream text using the ollama model
  const result = await streamText({
    model: ollama(selectedModel),
    messages: [
      ...convertToCoreMessages(initialMessages),
      ...contextMessages,
      { role: "user", content: messageContent },
    ],
  });

  return result.toDataStreamResponse();
}
