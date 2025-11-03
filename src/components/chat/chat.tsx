"use client";

import ChatTopbar from "./chat-topbar";
import ChatList from "./chat-list";
import ChatBottombar from "./chat-bottombar";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { BytesOutputParser } from "@langchain/core/output_parsers";
import { Attachment, ChatRequestOptions, generateId } from "ai";
import { Message, useChat } from "ai/react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import useChatStore from "@/app/hooks/useChatStore";
import { useRouter } from "next/navigation";
import Image from "next/image";

export interface ChatProps {
  id: string;
  initialMessages: Message[] | [];
  isMobile?: boolean;
}

export default function Chat({ initialMessages, id, isMobile }: ChatProps) {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
    setMessages,
    setInput,
    reload,
  } = useChat({
    id,
    initialMessages,
    onResponse: (response) => {
      if (response) {
        setLoadingSubmit(false);
      }
    },
    onFinish: (message) => {
      const enhancedMessage = enhanceAssistantMessage(message);
      if (messages.length > 0) {
        const updatedMessagesForView = messages.map((entry) =>
          entry.id === enhancedMessage.id ? enhancedMessage : entry
        );
        setMessages(updatedMessagesForView);
      }
      const savedMessages = getMessagesById(id);
      const updatedHistory = [...savedMessages, enhancedMessage];
      saveMessages(id, updatedHistory);
      setLoadingSubmit(false);
      router.replace(`/c/${id}`);
      void persistAssistantMemory(enhancedMessage, updatedHistory);
    },
    onError: (error) => {
      setLoadingSubmit(false);
      router.replace("/");
      console.error(error.message);
      console.error(error.cause);
      requestStartTimeRef.current = null;
      lastSubmittedModelRef.current = null;
    },
  });
  const [loadingSubmit, setLoadingSubmit] = React.useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const base64Images = useChatStore((state) => state.base64Images);
  const setBase64Images = useChatStore((state) => state.setBase64Images);
  const selectedModel = useChatStore((state) => state.selectedModel);
  const saveMessages = useChatStore((state) => state.saveMessages);
  const getMessagesById = useChatStore((state) => state.getMessagesById);
  const userName = useChatStore((state) => state.userName);
  const router = useRouter();
  const requestStartTimeRef = useRef<number | null>(null);
  const lastSubmittedModelRef = useRef<string | null>(null);
  const persistAssistantMemory = React.useCallback(
    async (assistantMessage: Message, history: Message[]) => {
      if (!assistantMessage?.content) {
        return;
      }

      try {
        await fetch("/api/memory", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chatId: id,
            role: "assistant",
            content: assistantMessage.content,
            history: history.map(({ id: messageId, role, content }) => ({
              id: messageId,
              role,
              content,
            })),
            userName,
          }),
        });
      } catch (error) {
        console.error("Failed to persist assistant memory:", error);
      }
    },
    [id, userName]
  );
  const enhanceAssistantMessage = React.useCallback(
    (message: Message): Message => {
      if (!message?.content) {
        requestStartTimeRef.current = null;
        lastSubmittedModelRef.current = null;
        return message;
      }

      if (lastSubmittedModelRef.current !== "eburon-tiny") {
        requestStartTimeRef.current = null;
        lastSubmittedModelRef.current = null;
        return message;
      }

      if (message.content.includes("Tokens:")) {
        requestStartTimeRef.current = null;
        lastSubmittedModelRef.current = null;
        return message;
      }

      const capabilityNote =
        "<sub>eburon-tiny • optimized for edge/mobile deployments</sub>";
      const trimmedContent = message.content.trimEnd();
      let bodyText = message.content;
      let noteSuffix = "";

      if (trimmedContent.endsWith(capabilityNote)) {
        noteSuffix = capabilityNote;
        bodyText = trimmedContent
          .slice(0, trimmedContent.length - capabilityNote.length)
          .trimEnd();
      }

      const statsSource = bodyText.trim();
      const characterCount = statsSource.length;
      const wordCount =
        statsSource.length > 0
          ? statsSource.split(/\s+/).filter(Boolean).length
          : 0;
      const tokenCount = Math.max(1, Math.ceil(characterCount / 4));

      const startTime = requestStartTimeRef.current;
      const elapsedSeconds = startTime
        ? (performance.now() - startTime) / 1000
        : 0;
      const safeSeconds = elapsedSeconds > 0.05 ? elapsedSeconds : 1;

      const charactersPerSecond =
        characterCount > 0 ? characterCount / safeSeconds : 0;
      const wordsPerSecond =
        wordCount > 0 ? wordCount / safeSeconds : 0;
      const energyKwh = tokenCount * 0.000022;

      const statsLines = [
        `Tokens: ${tokenCount}`,
        `Characters/s: ${charactersPerSecond.toFixed(2)}`,
        `WPS: ${wordsPerSecond.toFixed(2)}`,
        `Energy: ${energyKwh.toFixed(4)} kWh`,
      ].join("\n");

      const updatedBody = bodyText.length
        ? `${bodyText}\n\n${statsLines}`
        : statsLines;

      const newContent = noteSuffix
        ? `${updatedBody}\n\n${noteSuffix}`
        : updatedBody;

      requestStartTimeRef.current = null;
      lastSubmittedModelRef.current = null;

      return {
        ...message,
        content: newContent,
      };
    },
    []
  );

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    window.history.replaceState({}, "", `/c/${id}`);

    if (!selectedModel) {
      toast.error("Please select a model");
      return;
    }

    requestStartTimeRef.current = performance.now();
    lastSubmittedModelRef.current = selectedModel ?? null;

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: input,
    };

    setLoadingSubmit(true);

    const attachments: Attachment[] = base64Images
      ? base64Images.map((image) => ({
          contentType: "image/base64",
          url: image,
        }))
      : [];

    const requestOptions: ChatRequestOptions = {
      body: {
        selectedModel: selectedModel,
        chatId: id,
        userName,
      },
      ...(base64Images && {
        data: {
          images: base64Images,
        },
        experimental_attachments: attachments,
      }),
    };

    handleSubmit(e, requestOptions);
    saveMessages(id, [...messages, userMessage]);
    setBase64Images(null);
  };

  const removeLatestMessage = () => {
    const updatedMessages = messages.slice(0, -1);
    setMessages(updatedMessages);
    saveMessages(id, updatedMessages);
    return updatedMessages;
  };

  const handleStop = () => {
    stop();
    saveMessages(id, [...messages]);
    setLoadingSubmit(false);
    requestStartTimeRef.current = null;
    lastSubmittedModelRef.current = null;
  };

  return (
    <div className="flex flex-col w-full max-w-3xl h-full">
      <ChatTopbar
        isLoading={isLoading}
        chatId={id}
        messages={messages}
        setMessages={setMessages}
      />

      {messages.length === 0 ? (
        <div className="flex flex-col h-full w-full items-center gap-4 justify-center">
          <Image
            src="/ollama.png"
            alt="AI"
            width={40}
            height={40}
            className="h-16 w-14 object-contain dark:invert"
          />
          <p className="text-center text-base text-muted-foreground">
            How can I help you today?
          </p>
          <ChatBottombar
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={onSubmit}
            isLoading={isLoading}
            stop={handleStop}
            setInput={setInput}
          />
        </div>
      ) : (
        <>
          <ChatList
            messages={messages}
            isLoading={isLoading}
            loadingSubmit={loadingSubmit}
            reload={async () => {
              removeLatestMessage();
              requestStartTimeRef.current = performance.now();
              lastSubmittedModelRef.current = selectedModel ?? null;

              const requestOptions: ChatRequestOptions = {
                body: {
                  selectedModel: selectedModel,
                  chatId: id,
                  userName,
                },
              };

              setLoadingSubmit(true);
              return reload(requestOptions);
            }}
          />
          <ChatBottombar
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={onSubmit}
            isLoading={isLoading}
            stop={handleStop}
            setInput={setInput}
          />
        </>
      )}
    </div>
  );
}
