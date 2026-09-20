// Minimal OpenAI-compatible chat-completions client with streaming (SSE) support.
// Works against any gateway that implements POST {baseUrl}/chat/completions
// in the same shape as OpenAI's API (including vision "image_url" content parts).

import { ChatMessage, Settings } from "./types";

export interface StreamCallbacks {
  onToken: (delta: string) => void;
  onDone: (fullText: string) => void | Promise<void>;
  onError: (error: Error) => void;
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

/**
 * Sends one minimal, non-streaming chat completion request to verify the
 * gateway URL / API key / model name are all correct, without touching
 * history or the main streaming pipeline. Used by the settings page's
 * "一键测试" (test connection) button.
 */
export async function testConnection(settings: Settings): Promise<ConnectionTestResult> {
  if (!settings.baseUrl || !settings.apiKey || !settings.model) {
    return { ok: false, message: "missing-fields" };
  }

  const startedAt = performance.now();
  try {
    const response = await fetch(joinUrl(settings.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      // Deliberately omit "temperature" (see streamChatCompletion comment above).
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: "user", content: "ping" }],
        stream: false,
        max_tokens: 4,
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      return { ok: false, message: `HTTP ${response.status} ${bodyText || response.statusText}`.trim() };
    }

    await response.json().catch(() => undefined);
    const elapsedMs = Math.round(performance.now() - startedAt);
    return { ok: true, message: `${elapsedMs}ms` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Calls the chat completions endpoint with stream:true and forwards incremental
 * token deltas to onToken. Falls back gracefully if the gateway sends a single
 * non-streamed JSON body instead of SSE chunks.
 */
export async function streamChatCompletion(
  settings: Settings,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  if (!settings.baseUrl || !settings.apiKey || !settings.model) {
    callbacks.onError(new Error("请先在设置页填写网关地址 / API Key / 模型名称"));
    return;
  }

  let response: Response;
  try {
    response = await fetch(joinUrl(settings.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      // Note: intentionally omit "temperature" — several gateway-hosted models
      // (e.g. gpt-5-mini) only support the default value (1) and return a
      // 400 invalid_request_error if any other value is sent.
      body: JSON.stringify({
        model: settings.model,
        messages,
        stream: true,
      }),
      signal,
    });
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  if (!response.ok || !response.body) {
    const bodyText = await response.text().catch(() => "");
    callbacks.onError(new Error(`网关请求失败 (${response.status}): ${bodyText || response.statusText}`));
    return;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    // Non-streaming fallback: parse the whole JSON body at once.
    try {
      const json = await response.json();
      const text = json?.choices?.[0]?.message?.content ?? "";
      callbacks.onToken(text);
      await callbacks.onDone(text);
    } catch (err) {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          await callbacks.onDone(fullText);
          return;
        }
        try {
          const json = JSON.parse(data);
          const delta: string = json?.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            fullText += delta;
            callbacks.onToken(delta);
          }
        } catch {
          // Ignore malformed keep-alive lines.
        }
      }
    }
    await callbacks.onDone(fullText);
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
