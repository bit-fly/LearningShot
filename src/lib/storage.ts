// Thin wrappers around chrome.storage.local for settings and history.

import {
  ATTACHMENT_CONTEXT_END,
  ATTACHMENT_CONTEXT_START,
  ATTACHMENT_HISTORY_PLACEHOLDER,
  ChatContentPart,
  ChatMessage,
  DEFAULT_SETTINGS,
  HISTORY_LIMIT,
  HistoryEntry,
  Settings,
} from "./types";

const SETTINGS_KEY = "settings";
const HISTORY_KEY = "history";

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function getHistory(): Promise<HistoryEntry[]> {
  const stored = await chrome.storage.local.get(HISTORY_KEY);
  const history = (stored[HISTORY_KEY] as HistoryEntry[] | undefined) ?? [];
  return history.map(sanitizeHistoryEntry);
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  const history = await getHistory();
  history.unshift(sanitizeHistoryEntry(entry));
  if (history.length > HISTORY_LIMIT) {
    history.length = HISTORY_LIMIT;
  }
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

export async function clearHistory(): Promise<void> {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const history = await getHistory();
  await chrome.storage.local.set({ [HISTORY_KEY]: history.filter((h) => h.id !== id) });
}

// Patches an existing entry in place (used to persist follow-up chat turns
// appended after the initial capture/interpretation). No-ops if the id is
// no longer present (e.g. entry aged out past HISTORY_LIMIT).
export async function updateHistoryEntry(id: string, patch: Partial<HistoryEntry>): Promise<void> {
  const history = await getHistory();
  const idx = history.findIndex((h) => h.id === id);
  if (idx === -1) return;
  history[idx] = sanitizeHistoryEntry({ ...history[idx], ...patch });
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

function sanitizeHistoryEntry(entry: HistoryEntry): HistoryEntry {
  if (!entry.conversation) return entry;
  return {
    ...entry,
    conversation: sanitizeConversationForHistory(entry.conversation),
  };
}

function sanitizeConversationForHistory(conversation: ChatMessage[]): ChatMessage[] {
  return conversation.map((message) => {
    if (typeof message.content === "string") {
      const content = stripAttachmentContext(message.content);
      return content === message.content ? message : { ...message, content };
    }

    const hasImage = message.content.some((part) => part.type === "image_url");
    let changed = hasImage;
    const textParts: ChatContentPart[] = [];
    for (const part of message.content) {
      if (part.type === "text") {
        const text = stripAttachmentContext(part.text);
        changed ||= text !== part.text;
        textParts.push({ type: "text", text });
      }
    }
    if (hasImage) {
      textParts.push({
        type: "text",
        text: "[原始截图未保存到历史记录，请基于已保存的解读内容回答后续问题。]",
      });
    }
    return changed ? { ...message, content: textParts } : message;
  });
}

function stripAttachmentContext(text: string): string {
  const start = text.indexOf(ATTACHMENT_CONTEXT_START);
  if (start === -1) return text;

  const end = text.indexOf(ATTACHMENT_CONTEXT_END, start + ATTACHMENT_CONTEXT_START.length);
  const before = text.slice(0, start).trimEnd();
  const after = end === -1 ? "" : text.slice(end + ATTACHMENT_CONTEXT_END.length).trimStart();
  return [before, ATTACHMENT_HISTORY_PLACEHOLDER, after].filter(Boolean).join("\n\n");
}
