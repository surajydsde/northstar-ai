"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface StreamRequest {
  message: string;
  conversationId?: string;
}

export interface StreamCallbacks {
  onMeta?: (conversationId: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (message: string) => void;
}

interface StreamEvent {
  type: "meta" | "text" | "done" | "error";
  conversationId?: string;
  delta?: string;
  error?: string;
}

/**
 * Consumes the NDJSON stream from `POST /api/chat`.
 *
 * Tokens are rendered as the provider produces them. The previous version
 * awaited the complete response and then replayed it on a timer, which looked
 * like streaming but gave the user no output at all until the full round trip
 * had finished.
 */
export function useStreamingResponse() {
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const streamChat = useCallback(async (request: StreamRequest, callbacks: StreamCallbacks = {}) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStreamingText("");
    setIsStreaming(true);

    let accumulated = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, stream: true }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Request failed (${response.status})`);
      }

      if (!response.body) throw new Error("The server returned an empty response.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // NDJSON: a chunk boundary can land mid-line, so the trailing partial
      // line is carried over rather than parsed.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          let event: StreamEvent;
          try {
            event = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }

          if (event.type === "meta" && event.conversationId) {
            callbacks.onMeta?.(event.conversationId);
          } else if (event.type === "text" && event.delta) {
            accumulated += event.delta;
            setStreamingText(accumulated);
          } else if (event.type === "error") {
            throw new Error(event.error || "The response was interrupted.");
          }
        }
      }

      callbacks.onComplete?.(accumulated);
      return accumulated;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        // A deliberate cancel is not an error; keep whatever arrived.
        callbacks.onComplete?.(accumulated);
        return accumulated;
      }
      callbacks.onError?.(error instanceof Error ? error.message : "Unable to reach the assistant.");
      return accumulated;
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  return { streamingText, isStreaming, streamChat, cancel };
}
